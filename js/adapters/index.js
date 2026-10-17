const recent = require('./recent');
const vibrant = require('./vibrant');
const bestdesignsonx = require('./bestdesignsonx');
const generic = require('./generic');

const adapters = [recent, vibrant, bestdesignsonx];

function adapterFor(url) {
  return adapters.find((a) => a.matches(url)) || generic;
}

module.exports = { adapterFor, adapters, generic };
