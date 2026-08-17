// Build an allowlisted dist/ for `wrangler pages deploy`.
// The game lives in a real subfolder — dist/stratohop/ — so the Pages
// project can be bound to cloudarcade.app directly and serve the game at
// cloudarcade.app/stratohop/ with no proxy Worker. Pages Functions moved to
// functions/stratohop/api/* to match.
// Why: wrangler uploads EVERYTHING in the output dir (it ignores .gitignore,
// and some versions ignore .assetsignore too) — which once leaked .dev.vars.
// With an explicit allowlist, a leak requires adding a file here on purpose.
import { cpSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';

const ALLOW = [
  'index.html',
  '.env',        // deliberate: public app key + ws host only, never the secret
  'src',
  'vendor',
  'assets',
];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/stratohop', { recursive: true });
for (const entry of ALLOW) {
  if (!existsSync(entry)) { console.warn(`skip (missing): ${entry}`); continue; }
  cpSync(entry, `dist/stratohop/${entry}`, { recursive: true });
  console.log(`copied: stratohop/${entry}`);
}
// the arcade root: for now just send visitors to the game. 302 (not 301) so
// nothing sticks in caches when a real cloudarcade.app landing page arrives.
writeFileSync('dist/_redirects', '/ /stratohop/ 302\n');
console.log('wrote: _redirects (/ → /stratohop/)');
console.log('\ndist/ ready — deploy with: npx wrangler pages deploy');
