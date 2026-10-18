# Design Scrapper (Eagle plugin)

Eagle background-service plugin that imports new UI designs (images + MP4s) from configured
sources once a day. Plain HTML/CSS/CommonJS, no build step. Runs on Eagle's Chromium 107 / Node 16,
so avoid newer CSS (e.g. `color-mix`) and Node 18+ only APIs inside `js/`.

## Commands
- Tests: `node --test 'test/*.test.js'` (fixtures in `test/fixtures/`, saved from the live sites)
- Live check without Eagle: `node scripts/dry-run.js [hours=24 | all] [url ...]` (lists only, downloads nothing; `all` takes a few minutes)
- Load in Eagle: Plugins → Developer Options → Import local project → this folder. Logs: `eagle.log` (Eagle's log), set `devTools: true` in manifest.json for the inspector.

## Layout
- `js/main.js` Eagle entry: scheduler (hourly check, 24 h per source), run lock, notifications, `window.DS` for the UI.
- `js/ui.js` Sources window. `js/store.js` state JSON at `<eagle.app.userDataPath>/design-scrapper/state.json`.
- `js/runner.js` fetch → filter (time window + seen list + X status id + Eagle url check) → download → `eagle.item.addFromPath`.
- `js/adapters/*` one per site; `generic.js` is the best-effort fallback for any other link.
- `js/lib/seroval.js` safe reader for TanStack `$tsr` payloads (recent.design, vibrant.design). Never eval site code.

## Source notes
- recent.design / vibrant.design: data embedded in `<script class="$tsr">`; UI-only via `?category=interface` (vibrant: `/feed?category=interface`). vibrant disallows `/api/` in robots.txt, read HTML only.
- `since` passed to adapters: a timestamp, `0` = all time (no date filter, page to the end), `null`/missing = first page only.
- "Last X days" / "All time" runs page back past the first page: recent.design via its public oRPC endpoint (`POST https://api.recent.design/rpc/items/list`, `{json:{category,sort,limit,cursor}}`); vibrant via `sitemap.xml` → `sitemaps/projects-*.xml` (lastmod) → each `/feed/<id>-<slug>` page (`initialData` in `$tsr`); bestdesignsonx via `offset` paging.
- bestdesignsonx.com: public Supabase table read with the anon key found in the site bundle at runtime. Recent posts are untagged, so UI filtering falls back to post text.
