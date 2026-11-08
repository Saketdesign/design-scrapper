# design scrapper mobbin bridge

local chrome extension that connects the eagle plugin to your active mobbin session.
it queries the app selected via mcp and returns screen and animation download urls to eagle. it doesn't read or export cookies, passwords, or session tokens.

## install

1. open `chrome://extensions` and enable developer mode.
2. click **load unpacked** and select this folder.
3. in the design scrapper plugin window in eagle, choose **connect mobbin → pair chrome**.
4. on the local page, click the **design scrapper mobbin bridge** extension icon in chrome. compare the loopback address shown in the popup with the page eagle just opened, then click **approve pairing**. never approve an unexpected request from another localhost page.
5. return to eagle, choose **check connection**, and run the source.

keep chrome and eagle open during scheduled daily runs. the bridge reuses an existing mobbin tab or opens one in the background under the same profile.
the extension only accesses mobbin and the local loopback bridge on `http://127.0.0.1`.
