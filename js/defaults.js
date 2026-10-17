const DEFAULT_SOURCES = [
  { url: 'https://recent.design/?category=interface', enabled: true },
  { url: 'https://vibrant.design/', enabled: true },
  { url: 'https://bestdesignsonx.com/', enabled: true },
];

const RUN_EVERY_MS = 24 * 3600e3;
const CHECK_EVERY_MS = 3600e3;
const FIRST_RUN_LOOKBACK_MS = 24 * 3600e3;
// Overlap with the previous window so posts published while a run was in progress aren't missed.
const LOOKBACK_SLACK_MS = 6 * 3600e3;
const MAX_LOOKBACK_MS = 14 * 24 * 3600e3;

module.exports = { DEFAULT_SOURCES, RUN_EVERY_MS, CHECK_EVERY_MS, FIRST_RUN_LOOKBACK_MS, LOOKBACK_SLACK_MS, MAX_LOOKBACK_MS };
