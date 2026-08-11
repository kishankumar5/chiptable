// GitHub Pages has no rewrite rules: it serves 404.html for any path that
// isn't a real file, which is every shared game link. This writes a 404.html
// that remembers where the visitor was going and hands control to the app.
//
// Hosts with real rewrites (Vercel, Netlify) never use this file.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.VITE_BASE || '/';

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>ChipTable ♠</title>
    <script>
      try {
        sessionStorage.setItem('chiptable.redirect', location.href);
      } catch (e) {}
      location.replace(${JSON.stringify(base)});
    </script>
  </head>
  <body style="background:#04170f"></body>
</html>
`;

writeFileSync(join('dist', '404.html'), html);
console.log(`wrote dist/404.html (base ${base})`);
