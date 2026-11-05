const { cleanTitle } = require('./util');
const { exportApp } = require('../lib/mobbin-export');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_QUERY = 'app interface screen';
const INTENT = { task_intent: 'Save UI design references from one iOS app per day in an Eagle library.', output_destination: 'reference_library', output_tool: 'Eagle' };
const appKey = (name) => `ios:${String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()}`;
const dayOf = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function searchOptions(sourceUrl) {
  const url = new URL(sourceUrl);
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (/\/(web|android)(?:\/|$)/.test(path) || url.searchParams.get('platform') && url.searchParams.get('platform') !== 'ios') {
    throw new Error('Mobbin daily imports now select one iOS app. Use mobbin.com/discover/apps/ios/latest and pause other platform sources.');
  }
  if (!['/', '/discover', '/discover/apps/ios', '/discover/apps/ios/latest'].includes(path)) {
    throw new Error('Use mobbin.com/discover/apps/ios/latest for one iOS app per day through MCP.');
  }
  const query = (url.searchParams.get('query') || DEFAULT_QUERY).trim();
  if (!query || query.length > 500) throw new Error('Use a Mobbin search query between 1 and 500 characters.');
  // Old ?limit= links still work, but never limit the selected app's export.
  return { query };
}

function screensOf(result) {
  let data = result.structuredContent;
  if (!data || !Array.isArray(data.screens)) {
    for (const block of result.content || []) {
      if (block.type !== 'text') continue;
      try {
        const candidate = JSON.parse(block.text);
        if (candidate && Array.isArray(candidate.screens)) { data = candidate; break; }
      } catch { /* Ignore descriptive text and inline previews. */ }
    }
  }
  if (!data || !Array.isArray(data.screens)) throw new Error('Mobbin MCP returned an unexpected screen-search result.');
  return data.screens;
}

function parse(result, query) {
  return screensOf(result).map((screen) => {
    if (!UUID.test(screen.id || '') || !/^https:\/\//i.test(screen.image_url || '')) {
      throw new Error('Mobbin MCP returned a screen without a valid ID or full-resolution image URL.');
    }
    return {
      id: screen.id, xStatusId: null, title: cleanTitle(`${screen.app_name || 'Mobbin'} - ${screen.title || 'UI screen'}`),
      description: `Mobbin MCP search: ${query}`,
      creator: { name: screen.app_name || '', handle: '' },
      postUrl: null, pageUrl: `https://mobbin.com/screens/${screen.id}`,
      publishedAt: null, tags: [screen.platform, screen.app_name, 'Mobbin MCP'].filter(Boolean),
      media: [{ type: 'image', url: screen.image_url }],
    };
  });
}

const isAnimations = (sourceUrl) => new URL(sourceUrl).pathname.replace(/\/$/, '') === '/discover/apps/ios/animations';
const ANIMATIONS = '/api/discover/fetch-discover-page-animations';
const slugOf = (name) => String(name || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'app';

function animationItem(record) {
  const video = record.animationCdnVideoSources && record.animationCdnVideoSources.source && record.animationCdnVideoSources.source.url;
  if (!UUID.test(record.id || '') || !/^https:\/\//i.test(video || '')) return null;
  const app = String(record.appName || '').trim() || 'Mobbin';
  const appPage = UUID.test(record.appId || '') && UUID.test(record.appVersionId || '')
    ? `https://mobbin.com/apps/${slugOf(app)}-ios-${record.appId}/${record.appVersionId}/screens` : 'https://mobbin.com/discover/apps/ios/animations';
  return {
    id: `${record.id}:animation`, xStatusId: null, title: cleanTitle(`${app} - Animation ${record.id.slice(0, 8)}`),
    description: 'Mobbin iOS animations feed.', creator: { name: app, handle: '' }, postUrl: null, pageUrl: appPage,
    publishedAt: Date.parse(record.publishedAt || record.createdAt) || null,
    tags: ['ios', app, 'Mobbin', 'Animation'], media: [{ type: 'video', url: video }],
  };
}

// The animations tab's own feed, newest first, read in the signed-in Chrome tab.
async function fetchAnimations(website, { since, shouldStop = () => false }) {
  if (!website) throw new Error('Connect the Mobbin Chrome bridge to read the animations feed.');
  const items = [];
  let keysetPagination;
  for (;;) {
    if (shouldStop()) throw new Error('Stopped while reading the Mobbin animations feed.');
    const page = await website.request(ANIMATIONS, { platform: 'ios', ...(keysetPagination ? { keysetPagination } : {}) });
    if (!page || !Array.isArray(page.data)) throw new Error('Mobbin returned an unexpected animations feed.');
    items.push(...page.data.map(animationItem).filter(Boolean));
    const last = page.data[page.data.length - 1];
    const older = last && since && (Date.parse(last.publishedAt || last.createdAt) || 0) < since;
    if (!last || page.data.length !== page.pageSize || since == null || older) return items;
    keysetPagination = { lastPublishedAt: last.publishedAt, lastCreatedAt: last.createdAt, lastAnimationId: last.id };
  }
}

async function fetchItems(sourceUrl, { mobbin, mobbinWebsite, since, knownIds = [], isKnown = () => false, dailyState = {}, saveDailyState = () => {}, shouldStop, now = Date.now() }) {
  if (isAnimations(sourceUrl)) return fetchAnimations(mobbinWebsite, { since, shouldStop });
  const options = searchOptions(sourceUrl);
  if (!mobbin) throw new Error('Connect Mobbin MCP in Eagle from this source’s actions menu.');
  const day = dayOf(now);
  dailyState.completedApps = dailyState.completedApps || {};
  let current = dailyState.current;
  // Upgrade a previous 30-screen import by finishing that same app first.
  if (current && current.exportVersion !== 3) {
    current.seedScreenId = current.seedScreenId || current.screenIds && current.screenIds[0];
    delete current.completedAt;
    delete current.completedDay;
    current.exportVersion = 3;
    delete current.inventoryComplete;
    delete current.inspectedIds;
    delete current.inspectedVersionIds;
    delete current.assetIds;
    delete current.videoScreenIds;
    saveDailyState();
  }
  // A manual run, another source, or a date-range import cannot select a second app today.
  if (current && current.completedDay === day) return [];
  const exclude = [...new Set(knownIds)].filter((id) => UUID.test(id)).slice(0, 100);

  // Keep an incomplete selection even across days so a failed/stopped import resumes it.
  if (!current || current.completedAt) {
    const candidates = screensOf(await mobbin.callTool('search_screens', {
      platform: 'ios', query: options.query, limit: 30, mode: 'standard', image_format: 'webp', exclude_screen_ids: exclude, ...INTENT,
    }));
    const candidate = candidates.find((screen) => screen.platform === 'ios' && String(screen.app_name || '').trim()
      && UUID.test(screen.id || '') && !dailyState.completedApps[appKey(screen.app_name)]);
    if (!candidate) return [];
    current = { key: appKey(candidate.app_name), name: candidate.app_name.trim(), seedScreenId: candidate.id, selectedAt: now, selectedDay: day, exportVersion: 3 };
    dailyState.current = current;
    saveDailyState();
  }

  if (!UUID.test(current.seedScreenId || '')) {
    const results = screensOf(await mobbin.callTool('search_screens', { platform: 'ios', query: `${current.name} app screen`, limit: 30, mode: 'standard', image_format: 'webp', ...INTENT }));
    const seed = results.find((screen) => screen.platform === 'ios' && appKey(screen.app_name) === current.key && UUID.test(screen.id || ''));
    if (!seed) throw new Error('MCP could not find a screen from the selected app. Run again to retry the same app.');
    current.seedScreenId = seed.id;
    saveDailyState();
  }
  return exportApp(mobbinWebsite, current, { isKnown, save: saveDailyState, shouldStop });
}

function completeImport(plan, { store, libraryPath, now = Date.now() }) {
  const lib = store.library(libraryPath);
  const state = lib.mobbinDaily;
  const current = state && state.current;
  const metadata = plan.metadata;
  if (!current || current.completedAt || !metadata || metadata.appKey !== current.key || metadata.selectedAt !== current.selectedAt) return;
  if (!current.inventoryComplete || !current.assetIds || !current.assetIds.every((id) => lib.seen[`mobbin:${id}`])) return;
  current.completedAt = now;
  current.completedDay = dayOf(now);
  state.completedApps[current.key] = { name: current.name, completedAt: now, exportVersion: 3, screens: current.catalog.length, animations: current.videoScreenIds.length };
  // Keep the completion ledger small after all URLs and pending IDs are no longer needed.
  delete current.catalog;
  delete current.inspectedIds;
  delete current.inspectedVersionIds;
}

module.exports = {
  id: 'mobbin', label: 'mobbin.com', requiresLogin: true, allowsEmptyResults: true, requiresCompleteImport: true,
  matches: (url) => /^(www\.)?mobbin\.com$/i.test(new URL(url).hostname),
  scopeFor: (url) => { if (isAnimations(url)) return 'iOS animations'; try { searchOptions(url); return 'Full iOS app daily'; } catch { return 'MCP unsupported'; } },
  planMetadata: ({ dailyState, source }) => !isAnimations(source.url) && dailyState.current ? { appKey: dailyState.current.key, appName: dailyState.current.name, selectedAt: dailyState.current.selectedAt } : null,
  fetchItems, completeImport, parse, searchOptions, dayOf, appKey, isAnimations,
};
