# contributing to design scrapper

design scrapper is an open-source [Eagle](https://eagle.cool) plugin that saves curated ui screenshots and interaction videos into your eagle library.

## quick start

the plugin runtime executes inside eagle without external npm dependencies. node dependencies are for development and testing only.

```bash
# clone the repository
git clone https://github.com/Saketdesign/design-scrapper.git
cd design-scrapper

# install dev dependencies (eslint and sodium linter)
npm install

# run the test suite
npm test

# run the sodium design system linter
npm run lint
```

## testing sources without eagle

dry-run any scraper directly from your terminal without opening eagle or writing files:

```bash
# test all sources for the last 24 hours
node scripts/dry-run.js 24

# test a specific source
node scripts/dry-run.js 24 https://60fps.design/
node scripts/dry-run.js all https://vibrant.design/
```

## adding a new source adapter

1. create `js/adapters/<name>.js`.
2. implement the adapter interface:
   - `id`: unique string identifier
   - `label`: display label
   - `matches(url)`: boolean check
   - `fetchItems(url, { fetch, since, isKnown })`: returns an array of items with `{ id, title, pageUrl, postUrl, publishedAt, media, creator, tags }`
3. register the adapter in `js/adapters/index.js`.
4. add test fixtures to `test/fixtures/` and add test cases in `test/adapters.test.js` or `test/backfill.test.js`.
5. run `npm test` and `npm run lint` to verify.

## ui: sodium design system

the sources window uses the [Sodium](https://design.how/systems/sodium) token system.
- use tokens from `css/sodium/tokens.css`.
- do not use arbitrary inline colors or ad-hoc margins.
- run `npm run lint` before opening a pull request.

## issue triage & SLA

- triage commitment: issues and discussions are reviewed and triaged within 24 hours.
- security: report vulnerabilities or leaked credentials directly via github security advisories or by opening an issue.
