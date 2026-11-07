// Safe Next.js flight reader shared by the Chrome worker and Node fixture tests.
// JSON only: no eval, Function, or execution of downloaded scripts.
(function () {
  const PUSH = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

  function flightOf(html) {
    let flight = '';
    for (const match of html.matchAll(PUSH)) {
      try { flight += JSON.parse(match[1]); } catch { /* Ignore invalid script chunks. */ }
    }
    return flight;
  }

  // Each flight line is `<id>:<json>`; lines that are not JSON are skipped.
  function rootsOf(flight) {
    const roots = [];
    for (const line of flight.split('\n')) {
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      try { roots.push(JSON.parse(line.slice(separator + 1))); } catch { /* Not a JSON line. */ }
    }
    return roots;
  }

  const isScreen = (value) => Boolean(value.id && value.appId) && Object.prototype.hasOwnProperty.call(value, 'animationCdnVideoSources');

  function screenOf(value) {
    return {
      id: value.id, appId: value.appId, appName: value.appName, platform: value.platform,
      appVersionId: value.appVersionId, restricted: value.restricted,
      screenCdnImgSources: { downloadableSrc: value.screenCdnImgSources && value.screenCdnImgSources.downloadableSrc },
      animationCdnVideoSources: value.animationCdnVideoSources,
    };
  }

  const isObject = (value) => Boolean(value) && typeof value === 'object';

  function collectScreens(root, screens) {
    const stack = [root];
    while (stack.length) {
      const value = stack.pop();
      if (!isObject(value)) continue;
      if (isScreen(value)) screens.set(value.id, screenOf(value));
      for (const child of Object.values(value)) if (isObject(child)) stack.push(child);
    }
  }

  function extractAppPage(html) {
    const screens = new Map();
    for (const root of rootsOf(flightOf(html))) collectScreens(root, screens);
    return { screens: [...screens.values()] };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { extractAppPage };
  else globalThis.extractMobbinAppPage = extractAppPage;
})();
