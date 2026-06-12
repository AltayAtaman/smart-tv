# Changelog

## 2026-06-12

### Mobile app connectivity
- Enabled CORS on the Socket.IO server — the Capacitor Android app is a cross-origin client and was being rejected.
- Allowed cleartext HTTP in the Capacitor config and Android manifest so the app can reach the server over plain `http://`.
- Bundled the Socket.IO client into the app instead of loading it from a CDN, so the remote works without internet access (e.g. over USB via `adb reverse`).

### Remote UI
- New **Channels** panel with two groups:
  - **Streaming**: YouTube TV, Netflix, Twitch, Disney+, Kick, HBO Max, Exxen
  - **TV**: TRT 1, Kanal D, Show TV, NOW, CNN Türk, NTV, Habertürk
- Prominent full-width **⬅ Back** button under the D-pad (browser history back).

### TV browser (server)
- **Auto-fullscreen**: opening a TV channel pins the page's main video player to fill the screen and starts playback; a watcher keeps it pinned if the site re-renders.
- **Consent auto-accept**: cookie/KVKK banners (Turkish and English wording, iframes and shadow DOM included) are accepted automatically.
- **Ad popup cleanup**: overlay ads are closed via their ✕ buttons while a TV channel plays; popup windows are closed instantly; notification permission prompts are disabled.
- **Persistent profile**: logins and cookie choices are stored in `chrome-profile/` and survive server restarts.
- Crash fix: scanning frames that detach mid-pass (common on ad-heavy pages) no longer kills the server.

### Setup & quality of life
- The Android APK is served at `http://<server-ip>:3000/app.apk` for easy install on new phones.
- The TV screen shows a small corner badge with the remote URL, so the IP can be read off the screen when setting up a phone.
- The printed/displayed IP now prefers the real LAN address over VPN addresses (e.g. Tailscale).
