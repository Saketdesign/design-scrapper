// Safe Next.js flight reader shared by the Chrome worker and Node fixture tests.
// JSON only: no eval, Function, or execution of downloaded scripts.
(function () {
  function extractAppPage(html) {
    let flight = '';
    for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
      try { flight += JSON.parse(match[1]); } catch { /* Ignore invalid script chunks. */ }
    }
    const screens = new Map();
    for (const line of flight.split('\n')) {
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      let root;
      try { root = JSON.parse(line.slice(separator + 1)); } catch { continue; }
      const stack = [root];
      while (stack.length) {
        const value = stack.pop();
        if (!value || typeof value !== 'object') continue;
        if (value.id && value.appId && Object.prototype.hasOwnProperty.call(value, 'animationCdnVideoSources')) {
          screens.set(value.id, {
            id: value.id, appId: value.appId, appName: value.appName, platform: value.platform,
            appVersionId: value.appVersionId, restricted: value.restricted,
            screenCdnImgSources: { downloadableSrc: value.screenCdnImgSources && value.screenCdnImgSources.downloadableSrc },
            animationCdnVideoSources: value.animationCdnVideoSources,
          });
        }
        for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push(child);
      }
    }
    return { screens: [...screens.values()] };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { extractAppPage };
  else globalThis.extractMobbinAppPage = extractAppPage;
})();
