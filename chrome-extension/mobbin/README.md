# design scrapper mobbin bridge

local Chrome extension that connects the eagle plugin to your active mobbin session.
it queries the app selected via MCP and returns screen and animation download URLs to eagle. it does not read or export cookies, passwords, or session tokens.

## install

1. open `chrome://extensions` and enable Developer mode.
2. click **Load unpacked** and select this folder.
3. in the design scrapper plugin window in eagle, choose **Connect Mobbin → Pair Chrome**.
4. confirm pairing on the local page, return to eagle, choose **Check connection**, and run the source.

keep Chrome and eagle open during scheduled daily runs. the bridge reuses an existing mobbin tab or opens one in the background under the same profile.
the extension only accesses mobbin and the local loopback bridge on `http://127.0.0.1`.
