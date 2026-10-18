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

// "Run" range picker. null = normal run (new since the last run).
const RANGE_OPTIONS = [
  { days: null, label: 'New since last run' },
  { days: 3, label: 'Last 3 days' },
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 'all', label: 'All time' },
];
// Ask before importing when the range is this long (or all time); the size shown is a rough estimate.
const CONFIRM_FROM_DAYS = 7;
// Measured on the first real run (2026-10-18): 13 MP4s averaged ~2.9 MB, 4 images ~0.25 MB.
const AVG_MB_PER_VIDEO = 2.9;
const AVG_MB_PER_IMAGE = 0.25;

module.exports = {
  DEFAULT_SOURCES, RUN_EVERY_MS, CHECK_EVERY_MS, FIRST_RUN_LOOKBACK_MS, LOOKBACK_SLACK_MS, MAX_LOOKBACK_MS,
  RANGE_OPTIONS, CONFIRM_FROM_DAYS, AVG_MB_PER_VIDEO, AVG_MB_PER_IMAGE,
};
