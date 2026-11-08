// Request checks and response handling for the Chrome worker, kept free of Chrome APIs so Node tests can run them.
(function () {
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const KEYSET_FIELDS = ['lastPublishedAt', 'lastCreatedAt', 'lastAnimationId'];
  const PAGE = '/app-version-page';

  const isId = (value) => UUID.test(value || '');
  const isKeysetValue = (value) => value === null || (typeof value === 'string' && value.length <= 64);

  function validKeyset(keyset) {
    if (keyset === undefined) return true;
    if (!keyset || typeof keyset !== 'object') return false;
    return Object.keys(keyset).every((key) => KEYSET_FIELDS.includes(key)) && Object.values(keyset).every(isKeysetValue);
  }

  // What each endpoint may be asked for. A rule gets the request body and says whether it is acceptable.
  const RULES = new Map([
    ['/api/search-bar/fetch-searchable-apps', (body) => body.platform === 'ios'],
    ['/api/screen/fetch-screen-info', (body) => isId(body.screenId)],
    ['/api/app/fetch-app-versions-screens', (body) => isId(body.appId)],
    [PAGE, (body) => isId(body.appId) && isId(body.versionId) && /^[a-z0-9-]{1,120}$/.test(body.slug || '')],
    ['/api/discover/fetch-discover-page-animations', (body) => body.platform === 'ios' && validKeyset(body.keysetPagination)],
  ]);

  // An error message when the job is not one the bridge will run, else null.
  function validateJob(job) {
    const rule = RULES.get(job.endpoint);
    if (!rule) return 'The Chrome bridge rejected an unsupported request.';
    return rule(job.body || {}) ? null : 'The Chrome bridge rejected invalid request parameters.';
  }

  // The fetch the Mobbin tab makes: app pages are read with GET, everything else is a JSON POST.
  function requestSpec(endpoint, body) {
    if (endpoint === PAGE) return { target: `/apps/${body.slug}-ios-${body.appId}/${body.versionId}/screens`, init: { method: 'GET' } };
    return { target: endpoint, init: { method: 'POST', body: JSON.stringify(body) } };
  }

  const UNREACHABLE = 'Could not reach Mobbin in Chrome. Try again to resume the same app.';

  function failureFor(status) {
    if (status === 429) return 'Mobbin is rate limiting downloads. Try again later to resume the same app.';
    return `Mobbin website request failed (${status}).`;
  }

  // Turns what the page returned into the bridge's reply. `extract` reads an app page's HTML.
  function interpret(result, endpoint, extract) {
    if (!result) return { failure: 'Chrome did not return a Mobbin response.' };
    if (result.failure) return result;
    if (!result.ok) return { failure: failureFor(result.status) };
    if (endpoint === PAGE) return { data: { value: extract(result.text) } };
    try {
      return { data: JSON.parse(result.text) };
    } catch {
      return { failure: UNREACHABLE };
    }
  }

  const BRIDGE_TOKEN = /^[a-f0-9]{64}$/;

  // A content script may only nominate the exact loopback origin of its /connect tab.
  // The origin alone is NOT an identity check: the user must approve it in the extension popup.
  function trustedPairing(message, sender) {
    if (!message || message.type !== 'pair' || !sender || !sender.tab) return false;
    const config = message.config || {};
    if (!BRIDGE_TOKEN.test(config.token || '')) return false;
    try {
      const url = new URL(sender.url);
      return url.protocol === 'http:' && url.hostname === '127.0.0.1'
        && Boolean(url.port) && url.pathname === '/connect' && !url.search
        && (!url.hash || url.hash === `#${config.token}`)
        && config.base === url.origin;
    } catch { return false; }
  }

  const api = { validateJob, requestSpec, interpret, validKeyset, trustedPairing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(globalThis, { bridgeValidate: api });
})();
