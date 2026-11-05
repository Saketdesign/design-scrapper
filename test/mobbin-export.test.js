const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { catalogOf, mediaOf } = require('../js/lib/mobbin-export');
const fixture = JSON.parse(fs.readFileSync(`${__dirname}/fixtures/mobbin-website.json`));
const current = { name: 'Jomo', appId: fixture.catalog.id };
const { extractAppPage } = require('../chrome-extension/mobbin/page-data');

test('authenticated app-page data includes all 345 Jomo screens and the 12 animations omitted by the details API', () => {
  const html = fs.readFileSync(`${__dirname}/fixtures/mobbin-website-page.html`, 'utf8');
  const page = extractAppPage(html);
  assert.equal(page.screens.length, 345);
  assert.equal(page.screens.filter((s) => s.animationCdnVideoSources).length, 12);
  const video = page.screens.find((s) => s.animationCdnVideoSources);
  assert.equal(mediaOf({ ...video, app: { id: video.appId, appName: video.appName, platform: video.platform } }, current, video.id, false).video, `https://media.test/${video.id}.mp4`);
  assert.ok(page.screens.every((s) => s.screenCdnImgSources.downloadableSrc === null), 'page previews cannot be mistaken for full-resolution image downloads');
});

test('app-page parser joins split flight chunks without executing scripts or importing unrelated records', () => {
  const a = '1:'+JSON.stringify({ screens: [{ id: 'one', appId: 'app', animationCdnVideoSources: null }], unrelated: { id: 'two', image: 'ad' } })+'\n';
  const html = `<script>self.__next_f.push([1,${JSON.stringify(a.slice(0,30))}])</script><script>throw new Error('never executed')</script><script>self.__next_f.push([1,${JSON.stringify(a.slice(30))}])</script>`;
  assert.deepEqual(extractAppPage(html).screens.map((s) => s.id), ['one']);
});

test('reads the live Chrome website schema with every catalog screen and full-resolution downloads', () => {
  assert.equal(catalogOf(fixture.catalog, current).length, 35);
  assert.equal(mediaOf(fixture.screenInfo, current, fixture.screenInfo.id).image, 'https://media.test/jomo.png');
  assert.equal(mediaOf(fixture.screenInfo, current, fixture.screenInfo.id).video, null);
});

test('app catalog includes all versions, removes duplicate screen IDs, and rejects malformed versions', () => {
  const catalog = structuredClone(fixture.catalog);
  catalog.appVersions.push({ ...catalog.appVersions[0], id: '00000000-0000-4000-8000-000000000099' });
  assert.equal(catalogOf(catalog, current).length, 35);
  delete catalog.appVersions[1].appScreens;
  assert.throws(() => catalogOf(catalog, current), /incomplete app-version/);
});

test('a mismatched app, missing animation metadata, or incomplete video URL cannot pass as a full export', () => {
  assert.throws(() => catalogOf(fixture.catalog, { name: 'Other' }), /different app/);
  assert.throws(() => mediaOf({ ...fixture.screenInfo, id: 'different' }, current, fixture.screenInfo.id), /different screen/);
  const info = structuredClone(fixture.screenInfo);
  delete info.animationCdnVideoSources;
  assert.throws(() => mediaOf(info, current, info.id), /animation metadata has changed/);
  info.animationCdnVideoSources = {};
  assert.throws(() => mediaOf(info, current, info.id), /animation download URL/);
  info.animationCdnVideoSources = { source: { url: 'https://media.test/full-resolution.mp4' } };
  assert.equal(mediaOf(info, current, info.id).video, 'https://media.test/full-resolution.mp4');
});
