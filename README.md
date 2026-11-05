# design scrapper

> eagle plugin to pull ui screenshots and interaction videos from mobbin, 60fps, recent, vibrant, and other design galleries into your eagle library.

[![ci](https://github.com/Saketdesign/design-scrapper/actions/workflows/ci.yml/badge.svg)](https://github.com/Saketdesign/design-scrapper/actions/workflows/ci.yml)
[![license: mit](https://img.shields.io/badge/license-mit-yellow.svg)](LICENSE)

![design scrapper demo](assets/demo.gif)

## quick install

1. clone the repository:
   ```bash
   git clone https://github.com/Saketdesign/design-scrapper.git
   ```
2. in [eagle](https://eagle.cool): open **plugins** → **developer options** → **import local project...** → select the `design-scrapper` folder.
3. open the plugin from the eagle toolbar to choose sources and date ranges.

---

## supported sources

| source | type | content | backfill |
|---|---|---|---|
| **[mobbin](https://mobbin.com)** | mcp + chrome bridge | one full ios app catalog daily: all versions, screens, and mp4 interaction videos | yes |
| **[60fps.design](https://60fps.design)** | scraper | interaction videos (gumlet mp4) with paired metadata | yes |
| **[recent.design](https://recent.design)** | api / scraper | ui posts with multi-slide images and video clips | yes (orpc) |
| **[vibrant.design](https://vibrant.design)** | sitemap / seroval | interface screens (skips hover previews) | yes (sitemaps) |
| **[best designs on x](https://bestdesignsonx.com)** | supabase api | curated ui shots from x with creator handles | yes (bdox schema) |
| **[appinspo](https://appinspo.com)** | supabase api | mobile, desktop, watch, and vision ui mockups | yes |
| **[inspora](https://inspora.design)** | flight data | web and product ui interaction clips | live listing |
| **[spotted in prod](https://spottedinprod.com)** | flight data | community and editorial ui clips | curated feed |
| **generic urls** | open graph / dom | best-effort image and video extraction for gallery pages | current page |

## details

- deduplication: tracks post ids, creator handles, and x status ids so media shared across multiple sites is saved once.
- interface: built on sodium tokens with light and dark themes, status strips, and per-source progress steps.
- mobbin bridge: selects one ios app daily through mobbin's official mcp server, then downloads full-resolution screens and videos through a local chrome extension bridge using your active browser session.
- date ranges: daily schedule, or manual runs across 7, 14, 30, 90 days, or all time.
- zero extra runtime dependencies: runs on the native browser and node apis provided by eagle.

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

- issue sla: bug reports, questions, and feature requests get triaged within 24 hours.
- discussions: general feedback and source requests live in [github discussions](https://github.com/Saketdesign/design-scrapper/discussions).

## license

[mit](LICENSE) © 2026 Saket Joshi
