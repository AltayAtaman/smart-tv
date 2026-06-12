const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Download the Android app: open http://<server-ip>:3000/app.apk on the phone
app.get('/app.apk', (req, res) => {
    const apk = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    if (!fs.existsSync(apk)) return res.status(404).send('APK not built yet. Run: npx cap sync android && cd android && gradlew assembleDebug');
    res.download(apk, 'smart-tv-remote.apk');
});

let browser;
let page;

async function launchBrowser() {
    // Search for a system-installed browser as a fallback
    const executablePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    
    let executablePath = null;
    for (const p of executablePaths) {
        if (fs.existsSync(p)) {
            executablePath = p;
            console.log(`Found system browser at: ${executablePath}`);
            break;
        }
    }

    browser = await puppeteer.launch({
        headless: false,
        executablePath: executablePath, // Use system browser if found
        userDataDir: path.join(__dirname, 'chrome-profile'), // Persist cookies/logins across restarts
        args: [
            '--start-fullscreen',
            '--kiosk', // Optional: removes browser UI
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--autoplay-policy=no-user-gesture-required',
            '--disable-notifications' // No "show notifications?" permission prompts
        ],
        defaultViewport: null // Use the actual screen size
    });
    
    const pages = await browser.pages();
    page = pages[0];

    // Ads sometimes open new windows/tabs; close them immediately
    browser.on('targetcreated', async (target) => {
        if (target.type() !== 'page') return;
        const popup = await target.page().catch(() => null);
        if (popup && popup !== page) {
            console.log('Closing popup window');
            await popup.close().catch(() => {});
        }
    });
    
    // Set a User Agent to trick sites into TV mode if possible
    await page.setUserAgent('Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36');

    // Tiny corner badge with the remote URL, shown on every page so the IP
    // can be read off the TV screen when setting up a phone
    await page.evaluateOnNewDocument((addr) => {
        if (window !== window.top) return; // main page only, not ad iframes
        window.addEventListener('DOMContentLoaded', () => {
            const badge = document.createElement('div');
            badge.textContent = '📱 ' + addr;
            Object.assign(badge.style, {
                position: 'fixed',
                bottom: '6px',
                right: '8px',
                zIndex: '2147483647',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                font: '12px monospace',
                padding: '2px 8px',
                borderRadius: '6px',
                pointerEvents: 'none',
                opacity: '0.7'
            });
            if (document.body) document.body.appendChild(badge);
        });
    }, `${getLocalIp()}:${PORT}`);
    
    await page.goto('https://www.youtube.com/tv', { waitUntil: 'networkidle2' }).catch(e => console.log("Initial navigation error:", e.message));
}

// Continuous page cleaner: auto-accepts cookie/KVKK consent banners on every
// page, and (while a TV channel is playing) closes overlay ad popups by
// clicking their small X buttons. Runs every few seconds across all frames,
// including shadow DOM. Every await is guarded — frames detach constantly on
// ad-heavy pages and must never crash the server.
const CONSENT_TEXTS = [
    'tümünü kabul et', 'hepsini kabul et', 'kabul et', 'kabul ediyorum',
    'accept all', 'accept cookies', 'i accept', 'accept', 'agree',
    'izin ver', 'onayla', 'anladım', 'tamam'
];

let adCleanMode = false; // true while a TV channel is up; enables ad-popup closing
let cleaning = false;

async function cleanPass() {
    if (!page || cleaning) return;
    cleaning = true;
    try {
        let frames = [];
        try { frames = page.frames(); } catch (e) { return; }
        for (const frame of frames) {
            let acted = null;
            try {
                acted = await frame.evaluate((texts, killAds) => {
                    const els = [];
                    const collect = (root) => {
                        for (const el of root.querySelectorAll('*')) {
                            els.push(el);
                            if (el.shadowRoot) collect(el.shadowRoot);
                        }
                    };
                    collect(document);
                    const visible = (el) => {
                        const r = el.getBoundingClientRect();
                        return r.width > 0 && r.height > 0;
                    };

                    // 1) Consent banners: accept-style button inside a consent-looking container
                    const consentRe = /cookie|consent|kvkk|gdpr|onetrust|didomi|efilli|sourcepoint|cmp/i;
                    const inConsentContainer = (el) => {
                        let n = el;
                        while (n) {
                            if ((n.id && consentRe.test(n.id)) ||
                                (typeof n.className === 'string' && consentRe.test(n.className))) return true;
                            n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
                        }
                        return false;
                    };
                    for (const el of els) {
                        if (!el.matches || !el.matches('button, a, [role="button"]') || !visible(el)) continue;
                        const t = (el.textContent || '').trim().toLowerCase();
                        if (!t || t.length > 40) continue;
                        if (texts.some((s) => t.includes(s)) && inConsentContainer(el)) {
                            el.click();
                            return 'consent: ' + t;
                        }
                    }

                    // 2) Overlay ad popups: small X/close button on a high z-index overlay
                    if (killAds) {
                        const onOverlay = (el) => {
                            let n = el;
                            while (n && n !== document.body) {
                                const cs = getComputedStyle(n);
                                if ((cs.position === 'fixed' || cs.position === 'absolute') &&
                                    (parseInt(cs.zIndex, 10) || 0) >= 1000) return true;
                                n = n.parentElement;
                            }
                            return false;
                        };
                        for (const el of els) {
                            if (!visible(el) || !el.getBoundingClientRect) continue;
                            const r = el.getBoundingClientRect();
                            if (r.width > 60 || r.height > 60) continue;
                            const txt = (el.textContent || '').trim().toLowerCase();
                            const label = ((el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '').toLowerCase();
                            const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
                            const isX = ['×', '✕', '✖', 'x'].includes(txt) ||
                                /\b(close|kapat|dismiss)\b/.test(label) ||
                                /(^|[\s_-])(close|kapat)([\s_-]|$)/.test(cls);
                            if (isX && onOverlay(el)) {
                                el.click();
                                return 'ad popup closed';
                            }
                        }
                    }
                    return null;
                }, CONSENT_TEXTS, adCleanMode);
            } catch (e) {
                continue; // frame detached mid-scan; skip it
            }
            if (acted) {
                console.log('Auto-dismissed:', acted);
                break;
            }
        }
    } catch (error) {
        console.error('Clean pass error:', error.message);
    } finally {
        cleaning = false;
    }
}

setInterval(() => { cleanPass().catch(() => {}); }, 3000);

// Pin the page's main video player to fill the whole screen.
// Native fullscreen needs a real user click, so we maximize via CSS instead.
// Installs a watcher in the page so players that load late (or get
// re-rendered by the site) are pinned automatically without re-triggering.
async function enterFullscreen() {
    if (!page) return;
    try {
        await page.evaluate(() => {
            if (window.__fsWatcher) return;

            const maximize = () => {
                const els = Array.from(document.querySelectorAll('video, iframe'));
                let best = null, bestArea = 0;
                for (const el of els) {
                    const r = el.getBoundingClientRect();
                    const area = r.width * r.height;
                    if (area > bestArea) { bestArea = area; best = el; }
                }
                // Ignore tiny/hidden elements (ad trackers, not-yet-loaded players)
                if (!best || bestArea < 200 * 150) return;

                // position:fixed is clipped by transformed ancestors; neutralize them
                let p = best.parentElement;
                while (p && p !== document.body) {
                    const cs = getComputedStyle(p);
                    if (cs.transform !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none') {
                        p.style.transform = 'none';
                        p.style.filter = 'none';
                        p.style.perspective = 'none';
                    }
                    p = p.parentElement;
                }
                Object.assign(best.style, {
                    position: 'fixed',
                    top: '0',
                    left: '0',
                    width: '100vw',
                    height: '100vh',
                    zIndex: '2147483647',
                    background: '#000'
                });
                best.removeAttribute('width');
                best.removeAttribute('height');
                document.documentElement.style.overflow = 'hidden';
                document.body.style.overflow = 'hidden';
                if (best.tagName === 'VIDEO' && best.paused) {
                    best.play().catch(() => {});
                }
            };

            window.__fsWatcher = setInterval(maximize, 2000);
            maximize();
        });
        console.log('Fullscreen watcher installed');
    } catch (error) {
        console.error('Fullscreen error:', error.message);
    }
}

io.on('connection', (socket) => {
    console.log('Remote controller connected');

    socket.on('command', async (data) => {
        console.log('Received command:', data);
        if (!page) return;

        try {
            switch (data.type) {
                case 'KEY_PRESS':
                    await page.keyboard.press(data.key);
                    break;
                case 'NAVIGATE':
                    adCleanMode = !!data.fullscreen;
                    await page.goto(data.url, { waitUntil: 'networkidle2' });
                    if (data.fullscreen) await enterFullscreen();
                    break;
                case 'FULLSCREEN':
                    await enterFullscreen();
                    break;
                case 'TYPE':
                    await page.keyboard.type(data.text);
                    break;
                case 'BACK':
                    await page.goBack();
                    break;
                case 'RELOAD':
                    await page.reload();
                    break;
            }
        } catch (error) {
            console.error('Error executing command:', error.message);
        }
    });

    socket.on('disconnect', () => {
        console.log('Remote controller disconnected');
    });
});

const os = require('os');

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                candidates.push(iface.address);
            }
        }
    }
    // Prefer private LAN addresses over CGNAT/VPN ones (e.g. Tailscale 100.64+)
    const isLan = (a) => a.startsWith('192.168.') || a.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a);
    return candidates.find(isLan) || candidates[0] || 'localhost';
}

server.listen(PORT, '0.0.0.0', async () => {
    const ip = getLocalIp();
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Mobile Remote URL: http://${ip}:${PORT}`);
    console.log(`To control, open the Mobile Remote URL on your phone.`);
    await launchBrowser();
});
