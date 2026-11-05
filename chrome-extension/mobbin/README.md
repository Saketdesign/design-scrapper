# Design Scrapper Mobbin Bridge

This local Chrome extension lets the Eagle plugin use your existing Mobbin login.
It reads the app selected by MCP and returns its screens and animation download URLs
to Eagle. It never reads or exports cookies, passwords, or login tokens.

Install once in your signed-in Chrome profile:

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select this folder.
3. In Eagle's Design Scrapper, choose **Connect Mobbin → Pair Chrome**.
4. The Chrome pairing page confirms connection. Return to Eagle and choose
   **Check connection**, then run the Mobbin source.

Keep Chrome and Eagle open for daily imports. The bridge reuses an existing Mobbin
tab; if none exists, it opens one in the background using the same profile.
The extension accesses only Mobbin and Eagle's authenticated local loopback bridge.
It supports four fixed read-only API requests (including the iOS animations feed) and selected app-version pages, not arbitrary browser automation.

After updating this folder, choose **Reload** on the extension in Chrome. Remove
this extension to disconnect website access. Your Mobbin login is unchanged.
