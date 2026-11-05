# design scrapper

> eagle plugin to pull ui screenshots and interaction videos from mobbin, 60fps, recent, vibrant, and other design galleries into your eagle library.

[![CI](https://github.com/Saketdesign/design-scrapper/actions/workflows/ci.yml/badge.svg)](https://github.com/Saketdesign/design-scrapper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![design scrapper demo](assets/demo.gif)

## quick install

1. clone the repository:
   ```bash
   git clone https://github.com/Saketdesign/design-scrapper.git
   ```
2. in [Eagle](https://eagle.cool): open **Plugins** → **Developer Options** → **Import local project...** → select the `design-scrapper` folder.
3. open the plugin from the eagle toolbar to choose sources and date ranges.

---

## supported sources

| source | type | content | backfill |
|---|---|---|---|
| **[Mobbin](https://mobbin.com)** | MCP + Chrome bridge | one full iOS app catalog daily: all versions, screens, and MP4 interaction videos | yes |
| **[60fps.design](https://60fps.design)** | scraper | interaction videos (Gumlet MP4) with paired metadata | yes |
| **[Recent.design](https://recent.design)** | API / scraper | ui posts with multi-slide images and video clips | yes (oRPC) |
| **[Vibrant.design](https://vibrant.design)** | sitemap / seroval | interface screens (skips hover previews) | yes (sitemaps) |
| **[Best Designs on X](https://bestdesignsonx.com)** | Supabase API | curated ui shots from X with creator handles | yes (bdox schema) |
| **[AppInspo](https://appinspo.com)** | Supabase API | mobile, desktop, watch, and vision ui mockups | yes |
| **[Inspora](https://inspora.design)** | flight data | web and product ui interaction clips | live listing |
| **[Spotted in Prod](https://spottedinprod.com)** | flight data | community and editorial ui clips | curated feed |
| **generic URLs** | Open Graph / DOM | best-effort image and video extraction for gallery pages | current page |

## details

- deduplication: tracks post IDs, creator handles, and X status IDs so media shared across multiple sites is saved once.
- interface: built on sodium tokens with light and dark themes, status strips, and per-source progress steps.
- mobbin bridge: selects one iOS app daily through mobbin's official MCP server, then downloads full-resolution screens and videos through a local Chrome extension bridge using your active browser session.
- date ranges: daily schedule, or manual runs across 7, 14, 30, 90 days, or all time.
- zero extra runtime dependencies: runs on the native browser and Node APIs provided by eagle.

## development

```bash
# install dev dependencies
npm install

# run tests
npm test

# run the sodium design system linter
npm run lint

# test a source without opening eagle
node scripts/dry-run.js 24 https://60fps.design/
```

## contributing

pull requests and bug reports are welcome. see [CONTRIBUTING.md](CONTRIBUTING.md).

## community & support

- issue SLA: bug reports, questions, and feature requests get triaged within 24 hours.
- discussions: general feedback and source requests live in [GitHub Discussions](https://github.com/Saketdesign/design-scrapper/discussions).

## license

[MIT](LICENSE) © 2026 Saket Joshi
