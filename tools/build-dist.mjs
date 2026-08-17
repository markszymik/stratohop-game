// Build an allowlisted dist/ for `wrangler pages deploy`.
// Why: wrangler uploads EVERYTHING in the output dir (it ignores .gitignore,
// and some versions ignore .assetsignore too) — which once leaked .dev.vars.
// With an explicit allowlist, a leak requires adding a file here on purpose.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';

const ALLOW = [
  'index.html',
  '.env',        // deliberate: public app key + ws host only, never the secret
  'src',
  'vendor',
  'assets',
];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const entry of ALLOW) {
  if (!existsSync(entry)) { console.warn(`skip (missing): ${entry}`); continue; }
  cpSync(entry, `dist/${entry}`, { recursive: true });
  console.log(`copied: ${entry}`);
}
console.log('\ndist/ ready — deploy with: npx wrangler pages deploy');
