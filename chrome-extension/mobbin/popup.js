// All approval controls live in the extension origin, not on the untrusted loopback page.
const approve = document.getElementById('approve');
const message = document.getElementById('message');
const address = document.getElementById('address');

chrome.runtime.sendMessage({ type: 'pairing-status' }, (response) => {
  if (chrome.runtime.lastError || !response || !response.base) {
    message.textContent = 'No pairing request. In Eagle, choose Connect Mobbin → Pair Chrome, then reopen this popup.';
    return;
  }
  address.textContent = response.base;
  message.textContent = 'Pending connection to this local address:';
  approve.disabled = false;
});

approve.addEventListener('click', () => {
  approve.disabled = true;
  message.textContent = 'Verifying local bridge…';
  chrome.runtime.sendMessage({ type: 'approve-pair' }, (response) => {
    message.textContent = !chrome.runtime.lastError && response && response.ok
      ? 'Connected. Return to Eagle and choose Check connection.'
      : 'Connection failed or expired. Choose Pair Chrome in Eagle and try again.';
  });
});
