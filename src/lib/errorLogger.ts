const ERROR_LOG: Array<{ timestamp: string; message: string; stack?: string; url: string; context?: string }> = [];

export function logError(error: Error | string, context?: string) {
  const entry = {
    timestamp: new Date().toISOString(),
    message: typeof error === 'string' ? error : error.message,
    stack: typeof error === 'string' ? undefined : error.stack,
    url: window.location.href,
    context,
  };
  ERROR_LOG.push(entry);
  // Keep last 100 errors
  if (ERROR_LOG.length > 100) ERROR_LOG.shift();
  // Log to console in dev
  if (import.meta.env.DEV) console.error('[ErrorLogger]', entry);
}

export function getErrorLog() {
  return [...ERROR_LOG];
}
