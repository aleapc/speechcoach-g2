/**
 * React settings panel — runs on the phone (not G2).
 * Allows configuration of WPM thresholds, language, haptic feedback,
 * session history review with WPM timeline chart, and session export.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { state, type SessionRecord, type WpmThresholds, type WpmTimelinePoint } from './state';
import { t } from './i18n';

// ── Export helpers ──

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportSessionJson(session: SessionRecord): void {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `speech-session-${session.id}.json`);
}

function exportSessionCsv(session: SessionRecord): void {
  const headers = ['Date', 'Duration(s)', 'Avg WPM', 'Min WPM', 'Max WPM', 'Variation'];
  const variation = session.maxWpm - session.minWpm;
  const row = [session.date, session.durationSec, session.avgWpm, session.minWpm, session.maxWpm, variation];

  let csv = headers.join(',') + '\n' + row.join(',') + '\n';

  if (session.wpmTimeline?.length) {
    csv += '\nTimeline\nSecond,WPM\n';
    for (const point of session.wpmTimeline) {
      csv += `${point.sec},${point.wpm}\n`;
    }
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, `speech-session-${session.id}.csv`);
}

function exportAllSessionsJson(sessions: SessionRecord[]): void {
  const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'speech-sessions-all.json');
}

// ── WPM Chart Component ──

function WpmChart({ timeline, thresholds }: {
  timeline: WpmTimelinePoint[];
  thresholds: WpmThresholds;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = 440;
  const height = 180;
  const padding = { top: 10, right: 15, bottom: 30, left: 45 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || timeline.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxSec = Math.max(...timeline.map(p => p.sec));
    const maxWpm = Math.max(thresholds.fast + 40, ...timeline.map(p => p.wpm)) + 10;

    const xScale = (sec: number) => padding.left + (sec / maxSec) * chartW;
    const yScale = (wpm: number) => padding.top + chartH - (wpm / maxWpm) * chartH;

    // Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    // Zone bands
    const slowY = yScale(thresholds.slow);
    const fastY = yScale(thresholds.fast);

    // Fast zone (top, red)
    ctx.fillStyle = 'rgba(183, 28, 28, 0.12)';
    ctx.fillRect(padding.left, padding.top, chartW, fastY - padding.top);

    // OK zone (middle, green)
    ctx.fillStyle = 'rgba(27, 94, 32, 0.12)';
    ctx.fillRect(padding.left, fastY, chartW, slowY - fastY);

    // Slow zone (bottom, blue)
    ctx.fillStyle = 'rgba(26, 35, 126, 0.12)';
    ctx.fillRect(padding.left, slowY, chartW, padding.top + chartH - slowY);

    // Threshold lines
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, slowY);
    ctx.lineTo(padding.left + chartW, slowY);
    ctx.moveTo(padding.left, fastY);
    ctx.lineTo(padding.left + chartW, fastY);
    ctx.stroke();
    ctx.setLineDash([]);

    // WPM line
    ctx.strokeStyle = '#4caf50';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < timeline.length; i++) {
      const x = xScale(timeline[i].sec);
      const y = yScale(timeline[i].wpm);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${thresholds.slow}`, padding.left - 5, slowY + 4);
    ctx.fillText(`${thresholds.fast}`, padding.left - 5, fastY + 4);

    ctx.textAlign = 'center';
    const timeSteps = Math.min(5, maxSec);
    for (let i = 0; i <= timeSteps; i++) {
      const sec = Math.round((i / timeSteps) * maxSec);
      ctx.fillText(`${sec}s`, xScale(sec), height - 5);
    }

    // Axis title
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.fillText(t('timeAxis'), padding.left + chartW / 2, height - 1);

  }, [timeline, thresholds]);

  if (timeline.length < 2) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, borderRadius: 8, display: 'block', margin: '8px auto' }}
    />
  );
}

// ── Styles ──

const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: 480,
    margin: '0 auto',
    padding: 20,
    background: '#0a0a0a',
    color: '#e0e0e0',
    minHeight: '100vh',
  } as React.CSSProperties,
  header: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 24,
    color: '#4caf50',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  section: {
    marginBottom: 24,
    padding: 16,
    background: '#1a1a1a',
    borderRadius: 12,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 12,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: 4,
    fontSize: 14,
    color: '#aaa',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '10px 12px',
    marginBottom: 12,
    background: '#2a2a2a',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: 16,
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '10px 12px',
    marginBottom: 12,
    background: '#2a2a2a',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: 16,
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    padding: '8px 0',
  } as React.CSSProperties,
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderTop: '1px solid #222',
    fontSize: 13,
    color: '#666',
  } as React.CSSProperties,
  sessionItem: {
    padding: '10px 0',
    borderBottom: '1px solid #222',
  } as React.CSSProperties,
  sessionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,
  sessionDate: {
    fontSize: 12,
    color: '#666',
  } as React.CSSProperties,
  sessionStats: {
    fontSize: 14,
    color: '#ccc',
  } as React.CSSProperties,
  badge: (zone: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    background: zone === 'slow' ? '#1a237e' : zone === 'ok' ? '#1b5e20' : '#b71c1c',
    color: '#fff',
    marginLeft: 8,
  } as React.CSSProperties),
  exportBtn: {
    padding: '4px 10px',
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#4caf50',
    fontSize: 11,
    cursor: 'pointer',
    marginLeft: 4,
  } as React.CSSProperties,
  exportAllBtn: {
    padding: '4px 10px',
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#4caf50',
    fontSize: 11,
    cursor: 'pointer',
  } as React.CSSProperties,
  empty: {
    color: '#555',
    textAlign: 'center' as const,
    padding: 20,
  } as React.CSSProperties,
};

// ── App Component ──

function App() {
  const [thresholds, setThresholds] = useState<WpmThresholds>({ ...state.thresholds });
  const [language, setLanguage] = useState(state.language);
  const [hapticEnabled, setHapticEnabled] = useState(state.hapticEnabled);
  const [sessions, setSessions] = useState<SessionRecord[]>([...state.sessions]);
  // Dirty flag: only save when user explicitly changes a setting
  const isDirty = useRef(false);

  const saveToStorage = useCallback(() => {
    state.thresholds = { ...thresholds };
    state.language = language;
    state.hapticEnabled = hapticEnabled;

    try {
      localStorage.setItem('speechcoach_settings', JSON.stringify({
        thresholds,
        language,
        hapticEnabled,
      }));
    } catch {
      // Ignore
    }
  }, [thresholds, language, hapticEnabled]);

  // Only persist when settings actually change (dirty flag set by onChange handlers)
  useEffect(() => {
    if (isDirty.current) {
      isDirty.current = false;
      saveToStorage();
    }
  }, [saveToStorage]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('speechcoach_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.thresholds) {
          setThresholds(parsed.thresholds);
          state.thresholds = parsed.thresholds;
        }
        if (parsed.language) {
          setLanguage(parsed.language);
          state.language = parsed.language;
        }
        if (parsed.hapticEnabled !== undefined) {
          setHapticEnabled(parsed.hapticEnabled);
          state.hapticEnabled = parsed.hapticEnabled;
        }
      }
      const history = localStorage.getItem('speechcoach_history');
      if (history) {
        const parsed = JSON.parse(history);
        state.sessions = parsed;
        setSessions(parsed);
      }
    } catch {
      // Use defaults
    }
  }, []);

  function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(language, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getZone(wpm: number): string {
    if (wpm < thresholds.slow) return 'slow';
    if (wpm > thresholds.fast) return 'fast';
    return 'ok';
  }

  // Find most recent session with timeline data for chart
  const chartSession = sessions.find(s => s.wpmTimeline?.length >= 2);

  return (
    <div style={styles.container}>
      <div style={styles.header}>Speech Coach</div>

      {/* Settings */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>{t('settings')}</div>

        <label style={styles.label}>{t('slowThreshold')}</label>
        <input
          style={styles.input}
          type="number"
          min={50}
          max={200}
          value={thresholds.slow}
          onChange={e => { isDirty.current = true; setThresholds(prev => ({ ...prev, slow: Number(e.target.value) })); }}
        />

        <label style={styles.label}>{t('fastThreshold')}</label>
        <input
          style={styles.input}
          type="number"
          min={100}
          max={300}
          value={thresholds.fast}
          onChange={e => { isDirty.current = true; setThresholds(prev => ({ ...prev, fast: Number(e.target.value) })); }}
        />

        <label style={styles.label}>{t('language')}</label>
        <select
          style={styles.select}
          value={language}
          onChange={e => { isDirty.current = true; setLanguage(e.target.value); }}
        >
          <option value="en">English</option>
          <option value="pt">Portugues</option>
          <option value="es">Espanol</option>
        </select>

        <div style={styles.checkbox}>
          <input
            type="checkbox"
            id="haptic"
            checked={hapticEnabled}
            onChange={e => { isDirty.current = true; setHapticEnabled(e.target.checked); }}
          />
          <label htmlFor="haptic" style={{ color: '#aaa', fontSize: 14 }}>
            {t('hapticFeedback')} — {t('hapticHint')}
          </label>
        </div>

        {state.calibratedSilenceThreshold !== null && (
          <div style={styles.infoRow}>
            <span>{t('silenceThreshold')}</span>
            <span>{state.calibratedSilenceThreshold}</span>
          </div>
        )}
      </div>

      {/* WPM Timeline Chart */}
      {chartSession && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>{t('wpmGraph')}</div>
          <WpmChart timeline={chartSession.wpmTimeline} thresholds={thresholds} />
          <div style={{ textAlign: 'center', fontSize: 12, color: '#555', marginTop: 4 }}>
            {formatDate(chartSession.date)} — {chartSession.avgWpm} {t('wpm')} avg
          </div>
        </div>
      )}

      {/* Session History */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionTitle}>{t('recentSessions')}</div>
          {sessions.length > 0 && (
            <button
              style={styles.exportAllBtn}
              onClick={() => exportAllSessionsJson(sessions)}
            >
              {t('exportAll')}
            </button>
          )}
        </div>
        {sessions.length === 0 ? (
          <div style={styles.empty}>{t('noSessions')}</div>
        ) : (
          sessions.map(session => (
            <div key={session.id} style={styles.sessionItem}>
              <div style={styles.sessionRow}>
                <div>
                  <div style={styles.sessionStats}>
                    {session.avgWpm} {t('wpm')} — {formatDuration(session.durationSec)}
                    <span style={styles.badge(getZone(session.avgWpm))}>
                      {getZone(session.avgWpm).toUpperCase()}
                    </span>
                  </div>
                  <div style={styles.sessionDate}>{formatDate(session.date)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ color: '#555', fontSize: 12, marginRight: 8 }}>
                    {session.minWpm}-{session.maxWpm}
                  </span>
                  <button style={styles.exportBtn} onClick={() => exportSessionJson(session)}>
                    {t('exportJson')}
                  </button>
                  <button style={styles.exportBtn} onClick={() => exportSessionCsv(session)}>
                    {t('exportCsv')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function mountApp(): void {
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(<App />);
  }
}
