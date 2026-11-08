const { appTag } = require('./app-folders');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalized = (name) => String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const https = (url) => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };

function checkApp(app, current) {
  if (!app || !UUID.test(app.id || '') || app.platform !== 'ios' || normalized(app.appName) !== normalized(current.name)
    || current.appId && app.id !== current.appId) throw new Error('Mobbin returned a different app or platform. The selected iOS app has been kept for retry.');
}

function versionScreens(version) {
  if (!UUID.test(version.id || '') || !Array.isArray(version.appScreens)) throw new Error('Mobbin returned an incomplete app-version catalog.');
  return version.appScreens.map((screen) => {
    if (!UUID.test(screen.id || '')) throw new Error('Mobbin returned a screen without an ID.');
    return { id: screen.id, versionId: version.id, versionDate: version.publishedAt || version.createdAt || null };
  });
}

function catalogOf(app, current) {
  checkApp(app, current);
  if (!Array.isArray(app.appVersions) || !app.appVersions.length) throw new Error('Mobbin did not return the selected app’s screen catalog.');
  const screens = new Map();
  for (const version of app.appVersions) {
    for (const screen of versionScreens(version)) if (!screens.has(screen.id)) screens.set(screen.id, screen);
  }
  if (!screens.size) throw new Error('Mobbin returned no screens for the selected app.');
  return [...screens.values()];
}

function mediaOf(info, current, screenId, requireImage = true) {
  checkApp(info && info.app, current);
  if (info.id !== screenId) throw new Error('Mobbin returned details for a different screen.');
  const image = info.screenCdnImgSources && info.screenCdnImgSources.downloadableSrc;
  if (requireImage && !https(image)) throw new Error('Mobbin did not return a full-resolution screen download.');
  // Missing animation metadata is not the same as an explicit null (no animation).
  // Fail closed on schema changes so a partial catalog is never called complete.
  if (!Object.prototype.hasOwnProperty.call(info, 'animationCdnVideoSources')) throw new Error('Mobbin’s animation metadata has changed. The app has been kept for retry.');
  let video = null;
  if (info.animationCdnVideoSources !== null) {
    video = info.animationCdnVideoSources && info.animationCdnVideoSources.source && info.animationCdnVideoSources.source.url;
    if (!https(video)) throw new Error('Mobbin did not return a complete animation download URL.');
  }
  return { image, video };
}

function itemFor(current, screen, type, url) {
  const animation = type === 'video';
  return {
    id: animation ? `${screen.id}:animation` : screen.id,
    xStatusId: null, title: `${current.name} - ${animation ? 'Animation' : 'UI screen'} ${screen.id.slice(0, 8)}`,
    description: `Selected by Mobbin MCP. Full app export from Chrome.${screen.versionDate ? ` App version: ${screen.versionDate}.` : ''}`,
    creator: { name: current.name, handle: '' }, postUrl: null,
    pageUrl: `https://mobbin.com/screens/${screen.id}`, publishedAt: null,
    tags: ['ios', current.name, appTag(current.name), 'Mobbin', animation ? 'Animation' : 'Screen'], media: [{ type, url }],
  };
}

const STOPPED = 'Stopped while checking the app. Run again to resume the same app.';

async function ensureAppId(website, current, save) {
  if (current.appId) return;
  const seed = await website.request('/api/screen/fetch-screen-info', { screenId: current.seedScreenId });
  checkApp(seed && seed.app, current);
  current.appId = seed.app.id;
  save();
}

async function ensureCatalog(website, current, save) {
  if (current.catalog) return;
  const app = await website.request('/api/app/fetch-app-versions-screens', { appId: current.appId });
  current.catalog = catalogOf(app, current);
  save();
}

function groupByVersion(catalog) {
  const versions = new Map();
  for (const screen of catalog) {
    if (!versions.has(screen.versionId)) versions.set(screen.versionId, []);
    versions.get(screen.versionId).push(screen);
  }
  return versions;
}

const slugFor = (name) => normalized(name).normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'app';

function stopIfRequested(ex) {
  if (ex.shouldStop()) throw new Error(STOPPED);
}

const versionComplete = (ex, versionId, screens) =>
  ex.inspected.has(versionId) && screens.every((screen) => ex.isKnown(screen.id) && (!ex.videos.has(screen.id) || ex.isKnown(`${screen.id}:animation`)));

function screenMedia(current, record, versionId, screenId) {
  if (!record || record.appVersionId !== versionId) throw new Error('Mobbin did not return every screen in this app version. Run again to resume the same app.');
  if (record.restricted) throw new Error('Your Mobbin account cannot access this app version. Check your subscription in Chrome.');
  return mediaOf({ ...record, app: { id: record.appId, appName: record.appName, platform: record.platform } }, current, screenId, false);
}

// The download-details API returns null animation metadata even for real
// videos. Read the authenticated app page, which supplies the actual inventory.
async function inventory(ex, versionId, screens) {
  const page = await ex.website.request('/app-version-page', { appId: ex.current.appId, versionId, slug: ex.slug });
  if (!page || !Array.isArray(page.screens)) throw new Error('Mobbin did not return the app’s animation inventory.');
  const byId = new Map(page.screens.map((screen) => [screen.id, screen]));
  return new Map(screens.map((screen) => [screen.id, screenMedia(ex.current, byId.get(screen.id), versionId, screen.id)]));
}

function rememberVideos(ex, versionId, screens, media) {
  if (ex.inspected.has(versionId)) return;
  for (const screen of screens) if (media.get(screen.id).video) ex.videos.add(screen.id);
  ex.inspected.add(versionId);
  ex.current.inspectedVersionIds = [...ex.inspected];
  ex.current.videoScreenIds = [...ex.videos];
  ex.save();
}

async function exportScreen(ex, screen, urls) {
  if (!ex.isKnown(screen.id)) {
    const info = await ex.website.request('/api/screen/fetch-screen-info', { screenId: screen.id });
    ex.items.push(itemFor(ex.current, screen, 'image', mediaOf(info, ex.current, screen.id).image));
  }
  if (!ex.videos.has(screen.id) || ex.isKnown(`${screen.id}:animation`)) return;
  if (!urls.video) throw new Error('A pending Mobbin animation is unavailable. Run again to resume the same app.');
  ex.items.push(itemFor(ex.current, screen, 'video', urls.video));
}

async function exportVersion(ex, versionId, screens) {
  stopIfRequested(ex);
  if (versionComplete(ex, versionId, screens)) return;
  const media = await inventory(ex, versionId, screens);
  rememberVideos(ex, versionId, screens, media);
  for (const screen of screens) {
    stopIfRequested(ex);
    await exportScreen(ex, screen, media.get(screen.id));
  }
}

async function exportApp(website, current, { isKnown, save, shouldStop = () => false }) {
  if (!website) throw new Error('Connect the Mobbin Chrome bridge to download the selected app’s screens and animations.');
  await ensureAppId(website, current, save);
  await ensureCatalog(website, current, save);
  const ex = {
    website, current, isKnown, save, shouldStop, items: [], slug: slugFor(current.name),
    inspected: new Set(current.inspectedVersionIds || []), videos: new Set(current.videoScreenIds || []),
  };
  for (const [versionId, screens] of groupByVersion(current.catalog)) await exportVersion(ex, versionId, screens);
  current.assetIds = current.catalog.map((screen) => screen.id).concat([...ex.videos].map((id) => `${id}:animation`));
  current.videoScreenIds = [...ex.videos];
  current.inventoryComplete = true;
  save();
  return ex.items;
}

module.exports = { exportApp, catalogOf, mediaOf };
