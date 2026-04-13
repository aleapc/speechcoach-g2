/**
 * BackendClient - talks to the Speech Coach backend for real STT and
 * live speech metrics. Falls back silently if the backend is unreachable;
 * callers can inspect isConnected() to decide whether to use local RMS
 * estimation instead.
 *
 * Protocol:
 *   POST {url}/session              -> { id }
 *   POST {url}/session/:id/audio    (raw PCM body)
 *   GET  {url}/session/:id/stream   (SSE)
 *   POST {url}/session/:id/finalize -> { metrics }
 */

export interface BackendMetrics {
  wpm: number;
  fillerWords: number;
  pauseCount: number;
  avgPauseMs: number;
  wordCount: number;
  fillerBreakdown?: Record<string, number>;
}

export interface BackendUpdate {
  type: 'metrics' | 'partial' | 'final' | 'error';
  metrics?: BackendMetrics;
  transcript?: string;
  error?: string;
  elapsedMs: number;
}

export type BackendListener = (update: BackendUpdate) => void;

const DEFAULT_BACKEND_URL = 'http://localhost:8787';
const HEALTH_TIMEOUT_MS = 2500;

export class BackendClient {
  private url: string;
  private sessionId: string | null = null;
  private eventSource: EventSource | null = null;
  private connected = false;
  private pendingBytes = 0;
  private sendInFlight = false;
  // Buffer PCM chunks until we accumulate ~1 second, then POST.
  private chunkBuffer: ArrayBuffer[] = [];
  private bufferedBytes = 0;
  private readonly CHUNK_FLUSH_BYTES = 16000 * 2; // ~1 sec at 16kHz/16bit
  private readonly MAX_BUFFER_BYTES = 512_000; // ~500KB safety cap

  constructor(url: string) {
    this.url = url.replace(/\/$/, '');
  }

  getUrl(): string {
    return this.url;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /** Probe the backend. Returns true if /health responds within timeout. */
  async probe(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetch(`${this.url}/health`, {
        method: 'GET',
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Create a new session on the backend. */
  async createSession(): Promise<string | null> {
    try {
      const res = await fetch(`${this.url}/session`, { method: 'POST' });
      if (!res.ok) return null;
      const json = (await res.json()) as { id?: string };
      this.sessionId = json.id ?? null;
      this.connected = !!this.sessionId;
      return this.sessionId;
    } catch {
      this.connected = false;
      return null;
    }
  }

  /**
   * Connect to the SSE stream for live metric updates. Returns a
   * disconnect function.
   */
  connectStream(onUpdate: BackendListener): () => void {
    if (!this.sessionId) {
      return () => {};
    }
    // EventSource is available in modern WebViews.
    try {
      const es = new EventSource(`${this.url}/session/${this.sessionId}/stream`);
      this.eventSource = es;
      es.onmessage = (ev: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(ev.data) as BackendUpdate;
          onUpdate(parsed);
        } catch {
          // Ignore malformed frames
        }
      };
      es.onerror = () => {
        // Leave the ES open; browser auto-reconnects.
      };
    } catch {
      // EventSource unavailable — caller will fall back to local metrics.
    }
    return () => {
      this.closeStream();
    };
  }

  private closeStream(): void {
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // ignore
      }
      this.eventSource = null;
    }
  }

  /**
   * Queue a PCM audio chunk. The client batches writes so we don't
   * overwhelm the network with 100ms frames.
   */
  sendAudio(pcm: ArrayBuffer): void {
    if (!this.sessionId || !this.connected) return;
    this.chunkBuffer.push(pcm);
    this.bufferedBytes += pcm.byteLength;
    // Safety cap: discard oldest chunks if buffer grows too large
    // (e.g., when sendInFlight blocks flushing).
    while (this.bufferedBytes > this.MAX_BUFFER_BYTES && this.chunkBuffer.length > 1) {
      const discarded = this.chunkBuffer.shift()!;
      this.bufferedBytes -= discarded.byteLength;
    }
    if (this.bufferedBytes >= this.CHUNK_FLUSH_BYTES) {
      void this.flushBuffer();
    }
  }

  private async flushBuffer(): Promise<void> {
    if (this.sendInFlight) return;
    if (this.chunkBuffer.length === 0) return;
    if (!this.sessionId) return;
    this.sendInFlight = true;

    const chunks = this.chunkBuffer;
    const size = this.bufferedBytes;
    this.chunkBuffer = [];
    this.bufferedBytes = 0;

    // Concatenate into one Uint8Array.
    const combined = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      combined.set(new Uint8Array(c), offset);
      offset += c.byteLength;
    }

    try {
      this.pendingBytes += size;
      await fetch(`${this.url}/session/${this.sessionId}/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: combined,
      });
    } catch {
      // Network blip - mark disconnected; caller will fall back.
      this.connected = false;
    } finally {
      this.sendInFlight = false;
      this.pendingBytes -= size;
    }
  }

  /** Finalize the session. Returns final metrics if available. */
  async finalize(): Promise<BackendMetrics | null> {
    if (!this.sessionId) return null;
    // Flush any trailing audio first.
    await this.flushBuffer();
    try {
      const res = await fetch(`${this.url}/session/${this.sessionId}/finalize`, {
        method: 'POST',
      });
      if (!res.ok) {
        this.closeStream();
        this.sessionId = null;
        this.connected = false;
        return null;
      }
      const json = (await res.json()) as { metrics?: BackendMetrics };
      this.closeStream();
      this.sessionId = null;
      this.connected = false;
      return json.metrics ?? null;
    } catch {
      this.closeStream();
      this.sessionId = null;
      this.connected = false;
      return null;
    }
  }

  /** Abort the current session without waiting for a response. */
  abort(): void {
    this.closeStream();
    this.sessionId = null;
    this.connected = false;
    this.chunkBuffer = [];
    this.bufferedBytes = 0;
  }
}

export function getStoredBackendUrl(): string {
  try {
    const stored = typeof localStorage !== 'undefined'
      ? localStorage.getItem('speechcoach_backend_url')
      : null;
    if (stored && stored.trim().length > 0) return stored.trim();
  } catch {
    // ignore
  }
  return DEFAULT_BACKEND_URL;
}

export function setStoredBackendUrl(url: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('speechcoach_backend_url', url);
    }
  } catch {
    // ignore
  }
}

// Singleton for convenience. Callers can create new instances if they
// want custom URLs.
export const backendClient = new BackendClient(getStoredBackendUrl());
