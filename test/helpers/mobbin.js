const crypto = require('node:crypto');
const uuid = (value) => { const s = crypto.createHash('md5').update(value).digest('hex'); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
function websiteFor(screens, videoIds = [], calls = []) {
  const video = new Set(videoIds);
  const apps = new Map(screens.map((s) => [s.app_name, { id: uuid(s.app_name), appName: s.app_name, platform: s.platform || 'ios' }]));
  return { request: async (endpoint, body) => {
    calls.push({ endpoint, body });
    if (endpoint === '/app-version-page') {
      const app = [...apps.values()].find((a) => a.id === body.appId);
      return { screens: screens.filter((s) => s.app_name === app.appName).map((s) => ({
        id: s.id, appId: app.id, appName: app.appName, platform: app.platform,
        appVersionId: body.versionId, restricted: false,
        screenCdnImgSources: { downloadableSrc: s.image_url },
        animationCdnVideoSources: video.has(s.id) ? { source: { url: `https://media.test/${s.id}.mp4`, type: 'video/mp4', width: 1170 } } : null,
      })) };
    }
    if (endpoint === '/api/app/fetch-app-versions-screens') {
      const app = [...apps.values()].find((a) => a.id === body.appId);
      return { ...app, appVersions: [{ id: uuid(`${app.appName} version`), publishedAt: '2026-10-01', appScreens: screens.filter((s) => s.app_name === app.appName).map((s) => ({ id: s.id, screenUrl: s.image_url })) }] };
    }
    const screen = screens.find((s) => s.id === body.screenId);
    if (!screen) throw new Error('The pending screen is missing');
    // The real download-details endpoint omits videos even for animated screens.
    return { id: screen.id, app: apps.get(screen.app_name), screenCdnImgSources: { downloadableSrc: screen.image_url }, animationCdnVideoSources: null };
  } };
}
module.exports = { websiteFor, uuid };
