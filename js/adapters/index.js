const recent = require('./recent');
const vibrant = require('./vibrant');
const bestdesignsonx = require('./bestdesignsonx');
const sixtyfps = require('./sixtyfps');
const appinspo = require('./appinspo');
const inspora = require('./inspora');
const mobbin = require('./mobbin');
const spottedinprod = require('./spottedinprod');
const cosmos = require('./cosmos');
const generic = require('./generic');

const adapters = [recent, vibrant, bestdesignsonx, sixtyfps, appinspo, inspora, mobbin, spottedinprod, cosmos];

function adapterFor(url) {
  return adapters.find((a) => a.matches(url)) || generic;
}

module.exports = { adapterFor };
