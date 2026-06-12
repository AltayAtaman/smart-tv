# Smart TV Remote

A custom Smart TV remote system designed for Linux laptops connected to a TV via HDMI. Control your TV from your phone or any browser on your local network.

## Features

- **PWA + Android App**: Mobile-friendly remote as a web app, or install the native Android app from `http://<server-ip>:3000/app.apk`.
- **Browser Control**: Uses Puppeteer to manage a full-screen Chromium instance on the TV.
- **Channels Panel**: One-tap access to streaming services (YouTube TV, Netflix, Twitch, Disney+, Kick, HBO Max, Exxen) and Turkish TV channels (TRT 1, Kanal D, Show TV, NOW, CNN Türk, NTV, Habertürk).
- **Auto-Fullscreen**: TV channel streams are pinned to fill the screen automatically.
- **Self-Cleaning Pages**: Cookie/KVKK consent banners are auto-accepted and overlay ad popups auto-closed.
- **Persistent Logins**: The TV browser keeps its profile across restarts, so streaming logins stick.
- **D-Pad Navigation**: Full directional control (Up, Down, Left, Right, OK) plus a prominent Back button.
- **Search/Type**: Send text from your phone directly to the TV browser's active input.
- **On-Screen Remote URL**: A small badge on the TV shows the address to enter on your phone.

## Prerequisites

- **Node.js** (v14 or higher)
- **Linux Environment**: Designed for Linux (X11/Wayland), but can be tested on Windows/Mac.
- **Chromium/Chrome**: Puppeteer will use its bundled Chromium by default.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/AltayAtaman/smart-tv.git
   cd smart-tv
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the server on your Linux laptop:
   ```bash
   npm start
   ```

2. Note the **Mobile Remote URL** displayed in the terminal (e.g., `http://192.168.1.15:3000`).

3. Open this URL on your phone's browser.

4. (Optional) On mobile, select "Add to Home Screen" to install it as a PWA.

## Troubleshooting

### "Cannot open display" (SSH Users)
If you are running the server over SSH, ensure you export the display variable:
```bash
export DISPLAY=:0
npm start
```

### Linux Sandbox Issues
If Puppeteer fails to launch on Linux, you may need to install additional dependencies:
```bash
sudo apt install libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2
```

## License

ISC
