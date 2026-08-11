const unsafeExternalUrlError = 'External URL is not permitted.';

export function safeExternalUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error(unsafeExternalUrlError);
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username !== ''
      || url.password !== ''
    ) {
      throw new Error(unsafeExternalUrlError);
    }
    return url.href;
  } catch {
    throw new Error(unsafeExternalUrlError);
  }
}
