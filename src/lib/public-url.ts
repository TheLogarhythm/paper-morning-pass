export function publicPath(base: string, route: string): string {
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\') || /^[a-z]+:/i.test(route)) {
    throw new Error('Route must be a root-relative path.');
  }
  const normalizedBase = base === '/' ? '' : `/${base.replace(/^\/+|\/+$/g, '')}`;
  return `${normalizedBase}${route === '/' ? '/' : route}`;
}
