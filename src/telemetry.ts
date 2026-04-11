// G2 app telemetry client — reports errors to g2-telemetry Cloudflare Worker.
// Self-initializes error listeners on import. Silent fail on network issues.

const TELEMETRY_URL = 'https://g2-telemetry.your-subdomain.workers.dev' // TODO: replace with real URL after `wrangler deploy`
const APP_NAME = 'speechcoach'
const APP_VERSION = '0.6.0'

export interface TelemetryContext {
  [key: string]: unknown
}

export async function reportError(
  message: string,
  stack?: string,
  context?: TelemetryContext,
): Promise<void> {
  try {
    await fetch(`${TELEMETRY_URL}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: APP_NAME,
        version: APP_VERSION,
        message,
        stack,
        context,
        timestamp: Date.now(),
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      }),
    })
  } catch {
    // Silent fail — telemetry must never crash the app.
  }
}

// Auto-capture unhandled errors.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    reportError(event.message, event.error?.stack, {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string; stack?: string } | undefined
    reportError(
      `Unhandled promise rejection: ${reason?.message ?? String(event.reason)}`,
      reason?.stack,
    )
  })
}
