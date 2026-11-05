# Design Scrapper

> Eagle plugin that automatically scrapes and imports UI inspiration screenshots and interaction videos from Mobbin, 60fps, Recent, and Vibrant into your Eagle library.

[![CI](https://github.com/Saketdesign/design-scrapper/actions/workflows/ci.yml/badge.svg)](https://github.com/Saketdesign/design-scrapper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Design Scrapper Demo](assets/demo.gif)

## Quick Install

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Saketdesign/design-scrapper.git
   ```
2. In [Eagle](https://eagle.cool): Open **Plugins** → **Developer Options** → **Import local project...** → select the `design-scrapper` folder.
3. Open the plugin window from the Eagle toolbar to configure sources and ranges.

---

## Supported Sources

| Source | Type | Content Extracted | Backfill Support |
|---|---|---|---|
| **[Mobbin](https://mobbin.com)** | MCP + Chrome Bridge | Full iOS app catalog daily: all versions, screens, & MP4 interaction videos | Yes |
| **[60fps.design](https://60fps.design)** | Scraper | Interaction videos (Gumlet MP4) with paired shot/snippet metadata | Yes |
| **[Recent.design](https://recent.design)** | API / Scraper | UI posts with multi-slide images & capped videos | Yes (oRPC paging) |
| **[Vibrant.design](https://vibrant.design)** | Sitemap / Seroval | High-res UI screens (excludes hover previews) | Yes (sitemaps) |
| **[Best Designs on X](https://bestdesignsonx.com)** | Supabase API | Curated UI shots from X/Twitter with creator handles | Yes (bdox schema) |
| **[AppInspo](https://appinspo.com)** | Supabase API | Mobile, desktop, watch, and vision UI mockups | Yes |
| **[Inspora](https://inspora.design)** | Flight Data | Curated web and product UI interaction clips | Live listing |
| **[Spotted in Prod](https://spottedinprod.com)** | Flight Data | Community and editorial UI clips | Curated feed |
| **Generic URLs** | Open Graph / DOM | Best-effort image and video scraping for any gallery | Current page |

## Features

- **Cross-Source Deduplication**: Tracks post IDs, creator handles, and X status IDs so media shared across multiple aggregators is imported only once.
- **Sodium Design System UI**: Built with the [Sodium](https://design.how/systems/sodium) token system, supporting light and dark themes with native-feeling controls and progress indicators.
- **Mobbin Integration**: Daily selection of one iOS app via official Mobbin MCP search; automatically pulls full-resolution screens and videos through the included Chrome bridge with your existing session.
- **Flexible Run Windows**: Run daily on schedule, or backfill the last 7, 14, 30, 90 days, or "All time".
- **Zero Runtime Dependencies**: The Eagle plugin runs entirely on native browser & Node APIs inside Eagle.

## Development & Testing

```bash
# Install development dependencies
npm install

# Run the 71-test test suite
npm test

# Run the Sodium design system validator
npm run lint

# Dry-run any source in your terminal without Eagle
node scripts/dry-run.js 24 https://60fps.design/
```

## Contributing

Contributions, bug reports, and new source adapters are warmly welcomed! Please read our [Contributing Guide](CONTRIBUTING.md) and open an issue or pull request.

## License

[MIT](LICENSE) © 2026 Saket Joshi


## Community & Support

- **Issue SLA:** Bug reports, questions, and feature requests are reviewed within 24 hours.
- **Discussions:** Ideas and general feedback are welcome in [GitHub Discussions](https://github.com/Saketdesign/design-scrapper/discussions).
