const { appTag } = require('./app-folders');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalized = (name) => String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const https = (url) => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };

function checkApp(app, current) {
  if (!app || !UUID.test(app.id || '') || app.platform !== 'ios' || normalized(app.appName) !== normalized(current.name)
    || current.appId && app.id !== current.appId) throw new Error('Mobbin returned a different app or platform. The selected iOS app has been kept for retry.');
}

function catalogOf(app, current) {
  checkApp(app, current);
  if (!Array.isArray(app.appVersions) || !app.appVersions.length) throw new Error('Mobbin did not return the selected app’s screen catalog.');
  const screens = new Map();
  for (const version of app.appVersions) {
    if (!UUID.test(version.id || '') || !Array.isArray(version.appScreens)) throw new Error('Mobbin returned an incomplete app-version catalog.');
    for (const screen of version.appScreens) {
      if (!UUID.test(screen.id || '')) throw new Error('Mobbin returned a screen without an ID.');
      if (!screens.has(screen.id)) screens.set(screen.id, { id: screen.id, versionId: version.id, versionDate: version.publishedAt || version.createdAt || null });
    }
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

async function exportApp(website, current, { isKnown, save, shouldStop = () => false }) {
  if (!website) throw new Error('Connect the Mobbin Chrome bridge to download the selected app’s screens and animations.');
  if (!current.appId) {
    const seed = await website.request('/api/screen/fetch-screen-info', { screenId: current.seedScreenId });
    checkApp(seed && seed.app, current);
    current.appId = seed.app.id;
    save();
  }
  if (!current.catalog) {
    const app = await website.request('/api/app/fetch-app-versions-screens', { appId: current.appId });
    current.catalog = catalogOf(app, current);
    save();
  }
  const versions = new Map();
  for (const screen of current.catalog) {
    if (!versions.has(screen.versionId)) versions.set(screen.versionId, []);
    versions.get(screen.versionId).push(screen);
  }
  const inspected = new Set(current.inspectedVersionIds || []);
  const videos = new Set(current.videoScreenIds || []);
  const items = [];
  const slug = normalized(current.name).normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'app';
  for (const [versionId, screens] of versions) {
    if (shouldStop()) throw new Error('Stopped while checking the app. Run again to resume the same app.');
    if (inspected.has(versionId) && screens.every((screen) => isKnown(screen.id) && (!videos.has(screen.id) || isKnown(`${screen.id}:animation`)))) continue;
    // The download-details API returns null animation metadata even for real
    // videos. Read the authenticated app page, which supplies the actual inventory.
    const page = await website.request('/app-version-page', { appId: current.appId, versionId, slug });
    if (!page || !Array.isArray(page.screens)) throw new Error('Mobbin did not return the app’s animation inventory.');
    const byId = new Map(page.screens.map((screen) => [screen.id, screen]));
    const media = new Map();
    for (const screen of screens) {
      const record = byId.get(screen.id);
      if (!record || record.appVersionId !== versionId) throw new Error('Mobbin did not return every screen in this app version. Run again to resume the same app.');
      if (record.restricted) throw new Error('Your Mobbin account cannot access this app version. Check your subscription in Chrome.');
      media.set(screen.id, mediaOf({ ...record, app: { id: record.appId, appName: record.appName, platform: record.platform } }, current, screen.id, false));
    }
    if (!inspected.has(versionId)) {
      for (const screen of screens) if (media.get(screen.id).video) videos.add(screen.id);
      inspected.add(versionId);
      current.inspectedVersionIds = [...inspected];
      current.videoScreenIds = [...videos];
      save();
    }
    for (const screen of screens) {
      if (shouldStop()) throw new Error('Stopped while checking the app. Run again to resume the same app.');
      const urls = media.get(screen.id);
      if (!isKnown(screen.id)) {
        const info = await website.request('/api/screen/fetch-screen-info', { screenId: screen.id });
        const image = mediaOf(info, current, screen.id).image;
        items.push(itemFor(current, screen, 'image', image));
      }
      if (videos.has(screen.id) && !isKnown(`${screen.id}:animation`)) {
        if (!urls.video) throw new Error('A pending Mobbin animation is unavailable. Run again to resume the same app.');
        items.push(itemFor(current, screen, 'video', urls.video));
      }
    }
  }
  current.assetIds = current.catalog.map((screen) => screen.id).concat([...videos].map((id) => `${id}:animation`));
  current.videoScreenIds = [...videos];
  current.inventoryComplete = true;
  save();
  return items;
}

module.exports = { exportApp, catalogOf, mediaOf };
