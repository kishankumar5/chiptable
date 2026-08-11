// Puts the "generated, here's how to use it" header back on the bundled Edge
// Function after esbuild overwrites the file.

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'supabase/functions/game/bundled.ts';

const header = `// GENERATED — do not edit. Run \`npm run bundle:function\` to regenerate.
//
// A single self-contained copy of the Edge Function (index.ts plus the shared
// engine it imports). Paste this into the Supabase dashboard under
// Edge Functions -> Deploy a new function, name it \`game\`, if you would rather
// not install the Supabase CLI. Identical behaviour either way.

`;

writeFileSync(FILE, header + readFileSync(FILE, 'utf8'));
console.log(`stamped ${FILE}`);
