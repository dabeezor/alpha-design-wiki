/** Prefix a site-relative path with the site base. Absolute URLs and data: URIs pass through. */
export function withBase(path: string): string {
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) return path;
  return import.meta.env.BASE_URL.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}
