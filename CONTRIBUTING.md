# Contributing to Design Scrapper

Thank you for your interest in contributing! Design Scrapper is an open-source [Eagle](https://eagle.cool) plugin that automatically imports curated UI inspiration screenshots and interaction videos into your Eagle library.

## Quick Start

The plugin runtime runs inside Eagle without external npm dependencies. Node dependencies are for dev tools and tests only.

```bash
# Clone the repository
git clone https://github.com/Saketdesign/design-scrapper.git
cd design-scrapper

# Install dev dependencies (ESLint and Sodium linter)
npm install

# Run the test suite (71 passing tests)
npm test

# Run the Sodium design system linter
npm run lint
```

## Testing Sources without Eagle

You can dry-run any scraper directly from your terminal without opening Eagle or saving files:

```bash
# Test all sources for the last 24 hours
node scripts/dry-run.js 24

# Test a specific URL
node scripts/dry-run.js 24 https://60fps.design/
node scripts/dry-run.js all https://vibrant.design/
```

## Adding a New Source Adapter

1. Create a new adapter file in `js/adapters/<name>.js`.
2. Follow the adapter interface:
   - `id`: unique string identifier
   - `label`: display label
   - `matches(url)`: boolean check
   - `fetchItems(url, { fetch, since, isKnown })`: returns array of items with `{ id, title, pageUrl, postUrl, publishedAt, media, creator, tags }`
3. Register the adapter in `js/adapters/index.js`.
4. Add unit and backfill tests in `test/adapters.test.js` and `test/backfill.test.js` using recorded HTML/JSON fixtures in `test/fixtures/`.
5. Run `npm test` to verify everything passes.

## UI Guidelines: Sodium Design System

The Sources window UI is built using the [Sodium](https://design.how/systems/sodium) design system.
- All colors, typography, and spacing must use Sodium design tokens from `css/sodium/tokens.css`.
- Avoid arbitrary inline colors or ad-hoc margins.
- Run `npm run lint` before opening a pull request to ensure zero lint findings.

## Issue Triage & Maintenance SLA

We want contributors and users to have a responsive experience:
- **Triage Commitment**: We actively monitor GitHub Issues and Discussions and commit to acknowledging and triaging new issues within **24 hours**.
- **Security / Secrets**: If you find any security vulnerability or API key issue, please open an issue or security advisory immediately.
