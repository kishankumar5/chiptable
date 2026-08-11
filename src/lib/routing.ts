// Everything the app does with URLs goes through here, so the same build works
// at the root (Vercel, Netlify, dev) and under a subpath (GitHub Pages serves
// from /<repo>/).

/** Always starts and ends with "/" — Vite guarantees the trailing slash. */
export const BASE = import.meta.env.BASE_URL || '/';

/** App path ("/g/K7PX") -> browser path ("/ChipTable/g/K7PX"). */
export const toHref = (path: string) => BASE + path.replace(/^\//, '');

/** Browser path -> app path, with the base prefix removed. */
export function toAppPath(pathname: string): string {
  const base = BASE.replace(/\/$/, '');
  const stripped = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

export const absoluteUrl = (path: string) => `${location.origin}${toHref(path)}`;
