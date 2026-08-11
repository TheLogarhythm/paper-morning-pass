const publicPathError = 'Route must be a root-relative path.';
const sentinelUrl = 'https://public-path.invalid/';
const sentinelOrigin = new URL(sentinelUrl).origin;
const rawAsciiUrlControl = /[\u0000-\u001f\u007f]/;

function isRootPathname(value: string, allowQueryAndFragment: boolean): boolean {
  return value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\')
    && !rawAsciiUrlControl.test(value)
    && (allowQueryAndFragment || (!value.includes('?') && !value.includes('#')));
}

export function publicPath(base: string, route: string): string {
  if (!isRootPathname(base, false) || !isRootPathname(route, true)) {
    throw new Error(publicPathError);
  }
  const normalizedBase = base === '/' ? '' : `/${base.replace(/^\/+|\/+$/g, '')}`;
  const result = `${normalizedBase}${route === '/' ? '/' : route}`;

  try {
    if (new URL(result, sentinelUrl).origin !== sentinelOrigin) {
      throw new Error(publicPathError);
    }
  } catch {
    throw new Error(publicPathError);
  }

  return result;
}
