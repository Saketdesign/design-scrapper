# Source connections

Reload the plugin in Eagle after updating its files.

## Mobbin: MCP selection and full downloads through Chrome

Daily imports select **one iOS app per local calendar day** from official Mobbin MCP
search results. The plugin then reads that app's complete website catalog, including
all available versions, and imports **every screen and available animation video**.
There is no 30-screen export limit. MCP's 30-result limit applies only to finding the
app, not to its downloads. Apps without animations import their screens normally.
MCP does not expose Latest or Trending rankings.

### Connect once

1. In Chrome, keep your normal Mobbin subscription account signed in. No second login
   inside Eagle is needed.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and
   select this project's `chrome-extension/mobbin` folder.
3. Reload the plugin in Eagle. Choose **Connect Mobbin**, authorize MCP if needed,
   and choose **Pair Chrome**. The local page confirms pairing.
4. Back in Eagle, choose **Check connection**. Keep Chrome and Eagle open for scheduled
   imports. If no Mobbin tab is open, the bridge opens one in the background in the
   same Chrome profile, reusing that profile's login.

Use `https://mobbin.com/discover/apps/ios/latest` (or the root Mobbin URL). The default
MCP discovery query is `app interface screen`. To narrow discovery, use e.g.
`https://mobbin.com/discover/apps/ios/latest?query=banking%20app%20screen`.
Old `?limit=` parameters no longer cap downloads. The iOS animations source is an
alias for the same daily app import; a separate enabled source is unnecessary.
Web and Android remain outside this daily iOS mode.

### Completion and retry

The app selection, website app ID, complete catalog, animation inventory and pending
asset IDs are saved per Eagle library. Each screen and its video have separate
import IDs. A failed video resumes without duplicating a successfully imported image.
Stopped or failed imports keep the same app, including across restarts and days.
Completing a delayed import consumes the day on which it completes. Manual runs,
extra Mobbin sources, and date-range imports cannot select a second app that day.
Signed download URLs are refreshed for pending assets when resuming.

A previous 30-screen daily import is upgraded by finishing that same app, preserving
already imported images and adding any missing animations. Unknown or incomplete
website metadata fails explicitly; a partial catalog is never marked complete.
Date-range and All time runs use the same daily selection.

### Connection details

MCP uses the official `https://api.mobbin.com/mcp` server with OAuth, dynamic client
registration, PKCE, a state-checked loopback callback, and automatic token refresh.
Its owner-only `mobbin-oauth.json` file lives beside Eagle's plugin settings. The
Codex CLI's separate MCP authorization is not copied into the plugin.

The included Chrome extension has access only to `https://mobbin.com/*` and the
loopback bridge at `http://127.0.0.1/*`; it has no cookies permission. It performs
three fixed read-only API requests inside a Mobbin tab (searchable apps, screen
details and the version catalog), plus each selected app version’s screen page.
The page’s JSON flight data provides the full animation inventory; the details API
returns null animation metadata even for screens with videos. Every catalog ID must
appear in the page data before that version passes verification. It neither exports credentials
nor makes account or collection changes. The local server binds only to 127.0.0.1
and requires a random pairing secret, saved with owner-only permissions in
`mobbin-chrome.json`. Pairing sends the secret in a URL fragment, removes it from
browser history, and never sends it to Mobbin. No login secrets are written to the
repository or logs. Website endpoint changes can require an adapter update.

**Disconnect Mobbin MCP** removes only the plugin's MCP authorization. Remove the
Chrome extension to stop website access. Your normal Chrome Mobbin login remains
managed by Chrome. Revoke MCP server access in Mobbin Settings → MCP if needed.

Automated tests cover OAuth, Chrome pairing, endpoint restrictions, full exports
beyond 30 screens, separate animation retries, app matching, daily limits, and
recovery from partial imports. The website fixtures match the authenticated Chrome
response schema captured on November 5, 2026.

## Best Designs on X

The site now uses SvelteKit and the Supabase `bdox.bdox_designs` table. The adapter
discovers the public connection through the site's module graph and selects the
`bdox` schema. A live 30-day check returned 322 UI posts on November 5, 2026; a sample
video URL also returned playable MP4 content.

## Spotted in Prod

The adapter reads community clips and unlocked editorial clips from the page's
Next.js data, including titles, dates, tags, and original or transcoded videos.
The live listing returned 20 clips; sampled community and editorial URLs served MP4s.

Only the server-rendered listing is read. It is a curated selection, so **All time**
does not retrieve the full archive, and daily runs may miss clips outside that
selection. Locked clips are skipped.

## Cosmos

Cosmos is not supported yet. The root page exposes promotional media; the tested
explore and UI-search pages load their galleries in the browser. The dedicated
adapter reports this limitation instead of importing promotional images and marking
the source successful.

## Mobbin live verification (November 6, 2026)

Using the existing subscribed Chrome session, the full Jomo catalog contained 345
screens and 12 animation videos. The import added 314 missing screenshots and all
12 MP4s with no failed downloads; 31 Jomo screenshots were already recorded. The
current daily app completed on November 6, so another app is eligible the next day.
The full app-page fixture preserves the 345 screen records and 12 animation records
with media URLs replaced by `media.test` URLs. It reproduces the API's null video
metadata and page preview images with null download URLs, preventing either from
being mistaken for a complete export.
