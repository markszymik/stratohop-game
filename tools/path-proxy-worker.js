// ---------------------------------------------------------------------------
// Mount Stratohop under a path on cloudarcade.app:
//   https://cloudarcade.app/stratohop/  →  https://stratohop.pages.dev/
//
// One worker per game as the arcade grows (copy this file, change the two
// constants), or evolve it into a PREFIX→project map later.
//
// Cloudflare Pages can only bind whole (sub)domains, so a path mount needs
// this tiny Worker on YOUR zone. Setup (Cloudflare dashboard):
//   1. Workers & Pages → Create → Worker → paste this file → Deploy
//   2. On the worker: Settings → Domains & Routes → Add route:
//        route:  cloudarcade.app/stratohop*
//        zone:   cloudarcade.app
// That's it. The game is path-agnostic (all client URLs are relative), the
// Worker strips the prefix before hitting Pages, and Pages Functions
// (/api/vask/auth, /api/scores) keep working through the proxy.
//
// Bonus of serving from your own zone: Caching → Purge Cache works.
// ---------------------------------------------------------------------------
const PREFIX = '/stratohop';
const UPSTREAM = 'https://stratohop.pages.dev';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // exact prefix without trailing slash → redirect so relative URLs resolve
    if (url.pathname === PREFIX) {
      return Response.redirect(`${url.origin}${PREFIX}/${url.search}`, 301);
    }

    if (url.pathname.startsWith(PREFIX + '/')) {
      const upstreamUrl = UPSTREAM + url.pathname.slice(PREFIX.length) + url.search;
      return fetch(new Request(upstreamUrl, request));
    }

    // anything else on the route (shouldn't happen with a tight route pattern)
    return fetch(request);
  },
};
