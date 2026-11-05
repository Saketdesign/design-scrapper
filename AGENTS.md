# Design Scrapper (Eagle plugin)

Eagle background-service plugin that imports new UI designs (images + MP4s) from configured
sources once a day. Plain HTML/CSS/CommonJS, no build step. Runs on Eagle's Chromium 107 / Node 16,
so avoid newer CSS (e.g. `color-mix`) and Node 18+ only APIs inside `js/`.

## Commands
- Tests: `node --test 'test/*.test.js'` (fixtures in `test/fixtures/`, saved from the live sites)
- Live check without Eagle: `node scripts/dry-run.js [hours=24 | all] [url ...]` (lists only, downloads nothing; `all` takes a few minutes)
- Load in Eagle: Plugins → Developer Options → Import local project → this folder. Logs: `eagle.log` (Eagle's log), set `devTools: true` in manifest.json for the inspector.

## UI: Sodium design system
- The Sources window is built on Sodium (design.how). Follow `.claude/skills/sodium/SKILL.md` for every UI change.
- Sodium ships React + Tailwind v4; this plugin has no build step and Chromium 107 lacks what Tailwind v4 emits, so it is
  ported to plain CSS: `css/sodium/tokens.css` and `base.css` are vendored as shipped (fonts bundled in
  `assets/fonts/sodium/`), `recipes.css` and `components.css` port the recipes and components onto the same
  `data-slot`/`data-variant` markup the React components render. Read `https://design.how/systems/sodium/components/<name>.md`
  before using a component; `css/app.css` holds window layout only, in tokens.
- Lint: `npm install` once (dev tools only), then `npm run lint` = Sodium's ESLint plugin
  (`npx eslint -c sodium.eslint.config.mjs .`, JSX-only, so it finds little here) plus `node scripts/check-sodium.js`
  for the CSS and HTML strings. Both must exit 0.
- Information architecture: header (title, Import older menu, the one Run now slab) → failed-source Alert → status strip,
  replaced by the run frame while a run is going → tabs: Imports (recent, filterable) and Sources (rows with a switch and
  an actions menu, add form underneath).

## Layout
- `js/main.js` Eagle entry: scheduler (hourly check, 24 h per source), run lock, notifications, `window.DS` for the UI.
- `js/ui.js` Sources window (Sodium markup helpers at the top). `js/store.js` state JSON at `<eagle.app.userDataPath>/design-scrapper/state.json`.
- `js/runner.js` fetch → filter (time window + seen list + X status id + Eagle url check) → download → `eagle.item.addFromPath`.
- `js/adapters/*` one per site; `generic.js` is the best-effort fallback for any other link.
- `js/lib/seroval.js` safe reader for TanStack `$tsr` payloads (recent.design, vibrant.design). Never eval site code.

## Source notes
- recent.design / vibrant.design: data embedded in `<script class="$tsr">`; UI-only via `?category=interface` (vibrant: `/feed?category=interface`). vibrant disallows `/api/` in robots.txt, read HTML only.
- `since` passed to adapters: a timestamp, `0` = all time (no date filter, page to the end), `null`/missing = first page only.
- "Last X days" / "All time" runs page back past the first page: recent.design via its public oRPC endpoint (`POST https://api.recent.design/rpc/items/list`, `{json:{category,sort,limit,cursor}}`); vibrant via `sitemap.xml` → `sitemaps/projects-*.xml` (lastmod) → each `/feed/<id>-<slug>` page (`initialData` in `$tsr`); bestdesignsonx via `offset` paging.
- bestdesignsonx.com: public Supabase table read with the anon key found in the site bundle at runtime. Recent posts are untagged, so UI filtering falls back to post text.
- 60fps.design (`/` shots, `/snippets`): Framer HTML, no dates on listings. Cards are video then `<a href="./shots|snippets/<slug>"><p>Title</p>`; ads and nav links are skipped by that pairing. Unknown shots get their `/shots/<slug>` page read for the JSON-LD `VideoObject` (title, description, uploadDate), stopping after 3 in a row before the range. Only what the listing shows is reachable (~32 shots, 4 snippets); the full archive would mean ~1 MB per shot page.
- appinspo.com: public Supabase `mockups` table (anon key from the bundle, like bestdesignsonx). UI = categories desktop/mobile/watch/vision; a `/tagged/<category>` source keeps that one.
- mobbin.com full-app export: items are tagged `App: <name>`; once an app completes, `js/lib/app-folders.js` (via `eagle.smartFolder`, Eagle 4.0 b22+)
  tags any older imports and creates a `<name>` smart folder (tag rule) inside the root "Apps" group (the one with no conditions). Marked `organized` in `completedApps`.
- mobbin.com `/discover/apps/ios/animations`: a separate mode from the one-app-per-day export (no MCP). Reads the tab's own feed,
  `POST /api/discover/fetch-discover-page-animations` `{platform:'ios', keysetPagination:{lastPublishedAt,lastCreatedAt,lastAnimationId}}`
  → `{data, pageSize}`, newest first, through the Chrome bridge (signed out it returns `unauthenticated`). Pages back until past `since`.
- inspora.design: Next.js; posts are in the `initialPage` of the flight data (`self.__next_f`). Reads `/?category=Web` and `/?category=Product` (newest 16 each, ~4 weeks); `/api/` is disallowed and post pages/sitemap trip Vercel's bot check (429), so no paging back.
