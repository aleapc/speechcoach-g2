/**
 * React settings panel — runs on the phone (not G2).
 * Allows configuration of WPM thresholds, language, and session history review.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { state, type SessionRecord, type WpmThresholds } from './state';
import { t } from './i18n';

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
  sessionItem: {
    padding: '10px 0',
    borderBottom: '1px solid #222',
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
  const [sessions, setSessions] = useState<SessionRecord[]>([...state.sessions]);
  const [, forceUpdate] = useState(0);

  const saveToStorage = useCallback(() => {
    state.thresholds = { ...thresholds };
    state.language = language;

    // Save to localStorage (phone-side, for sync to bridge on next connect)
    try {
      localStorage.setItem('speechcoach_settings', JSON.stringify({
        thresholds,
        language,
      }));
    } catch {
      // Ignore
    }
    forceUpdate(n => n + 1);
  }, [thresholds, language]);

  useEffect(() => {
    saveToStorage();
  }, [saveToStorage]);

  useEffect(() => {
    // Load from localStorage on mount
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
          onChange={e => setThresholds(prev => ({ ...prev, slow: Number(e.target.value) }))}
        />

        <label style={styles.label}>{t('fastThreshold')}</label>
        <input
          style={styles.input}
          type="number"
          min={100}
          max={300}
          value={thresholds.fast}
          onChange={e => setThresholds(prev => ({ ...prev, fast: Number(e.target.value) }))}
        />

        <label style={styles.label}>{t('language')}</label>
        <select
          style={styles.select}
          value={language}
          onChange={e => setLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="pt">Portugues</option>
          <option value="es">Espanol</option>
        </select>
      </div>

      {/* Session History */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>{t('recentSessions')}</div>
        {sessions.length === 0 ? (
          <div style={styles.empty}>{t('noSessions')}</div>
        ) : (
          sessions.map(session => (
            <div key={session.id} style={styles.sessionItem}>
              <div>
                <div style={styles.sessionStats}>
                  {session.avgWpm} {t('wpm')} — {formatDuration(session.durationSec)}
                  <span style={styles.badge(getZone(session.avgWpm))}>
                    {getZone(session.avgWpm).toUpperCase()}
                  </span>
                </div>
                <div style={styles.sessionDate}>{formatDate(session.date)}</div>
              </div>
              <div style={{ color: '#555', fontSize: 12 }}>
                {session.minWpm}-{session.maxWpm} {t('wpm')}
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
