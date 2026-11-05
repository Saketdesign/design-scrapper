// The pairing secret is a fragment, so it is never sent in an HTTP request or referrer.
if (location.pathname === '/connect' && /^[a-f0-9]{64}$/.test(location.hash.slice(1))) {
  const config = { base: location.origin, token: location.hash.slice(1) };
  history.replaceState(null, '', '/connect');
  chrome.runtime.sendMessage({ type: 'pair', config }, (result) => {
    const status = document.getElementById('bridge-status');
    if (status) status.textContent = result?.ok ? 'Chrome is connected. Return to Eagle and choose Check connection. Your existing Mobbin login will be used.' : 'Could not connect. In Eagle, choose Pair Chrome and try again.';
  });
}
