module.exports = {
  id: 'cosmos', label: 'cosmos.so',
  matches: (url) => /^(www\.)?cosmos\.so$/i.test(new URL(url).hostname),
  async fetchItems() {
    throw new Error('Cosmos galleries are not supported yet: the site loads designs in the browser. Promotional images are not imported.');
  },
};
