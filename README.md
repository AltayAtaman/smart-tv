# Smart TV Remote

A custom Smart TV remote system designed for Linux laptops connected to a TV via HDMI. Control your TV from your phone or any browser on your local network.

## Features

- **PWA Remote Control**: Mobile-friendly interface that can be installed on your phone.
- **Browser Control**: Uses Puppeteer to manage a full-screen Chromium instance on the TV.
- **YouTube Optimized**: Pre-configured to launch YouTube TV for a seamless couch experience.
- **D-Pad Navigation**: Full directional control (Up, Down, Left, Right, OK).
- **Search/Type**: Send text from your phone directly to the TV browser's active input.
- **Quick Launch**: Buttons to quickly switch between YouTube and other web-based TV sources.

## Prerequisites

- **Node.js** (v14 or higher)
- **Linux Environment**: Designed for Linux (X11/Wayland), but can be tested on Windows/Mac.
- **Chromium/Chrome**: Puppeteer will use its bundled Chromium by default.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/smart-tv.git
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
