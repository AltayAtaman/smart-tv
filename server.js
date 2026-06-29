const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { Bonjour } = require('bonjour-service');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// Allow cross-origin fetch() requests from the Capacitor native app
// (which runs internally from http://localhost) to reach the API routes.
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));


// Download the Android app: open http://<server-ip>:3000/app.apk on the phone.
// release/ holds the latest committed build so any machine that pulls the
// repo can serve it; falls back to a local gradle build output if present.
app.get('/app.apk', (req, res) => {
    const candidates = [
        path.join(__dirname, 'release', 'smart-tv-remote.apk'),
        path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
    ];
    const apk = candidates.filter(fs.existsSync)
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (!apk) return res.status(404).send('No APK available in this checkout.');
    res.download(apk, 'smart-tv-remote.apk');
});

const { exec, spawn } = require('child_process');

function checkGitUpdate() {
    return new Promise((resolve) => {
        exec('git fetch origin master', (err) => {
            if (err) {
                console.error('Git fetch failed:', err.message);
                return resolve({ updateAvailable: false, error: 'Git fetch failed' });
            }
            exec('git rev-parse HEAD', (err, localSha) => {
                if (err) return resolve({ updateAvailable: false, error: err.message });
                exec('git rev-parse origin/master', (err, remoteSha) => {
                    if (err) return resolve({ updateAvailable: false, error: err.message });
                    const local = localSha.trim();
                    const remote = remoteSha.trim();
                    resolve({
                        updateAvailable: local !== remote,
                        localSha: local.substring(0, 7),
                        remoteSha: remote.substring(0, 7)
                    });
                });
            });
        });
    });
}

function performServerUpdate() {
    return new Promise((resolve, reject) => {
        console.log('Auto-update: Starting git pull...');
        exec('git pull', (err) => {
            if (err) return reject(new Error('Git pull failed: ' + err.message));
            console.log('Auto-update: Running npm install...');
            exec('npm install', (err) => {
                if (err) return reject(new Error('npm install failed: ' + err.message));
                console.log('Auto-update: Running cap sync android...');
                exec('npx cap sync android', (err) => {
                    if (err) {
                        console.warn('Auto-update: cap sync warning:', err.message);
                    }
                    resolve();
                });
            });
        });
    });
}

// Check for updates
app.get('/api/version', async (req, res) => {
    const isGit = fs.existsSync(path.join(__dirname, '.git'));
    let gitInfo = { updateAvailable: false };
    if (isGit) {
        gitInfo = await checkGitUpdate().catch(() => ({ updateAvailable: false, error: 'Git check failed' }));
    }
    res.json({
        serverVersion: require('./package.json').version,
        isGit: isGit,
        git: gitInfo
    });
});

// Perform update and restart
app.post('/api/update', async (req, res) => {
    const isGit = fs.existsSync(path.join(__dirname, '.git'));
    if (!isGit) {
        return res.status(400).json({ error: 'Auto-update only supported for git repositories.' });
    }
    
    // Respond to remote controller immediately so it knows we accepted the update command
    res.json({ status: 'updating', message: 'Pulling updates and restarting TV server...' });
    
    try {
        await performServerUpdate();
        console.log('Auto-update: Pull complete. Scheduling server restart in 1.5s...');
        
        // Spawn a helper process to delay, then start the server again, and exit
        const escapedNode = process.argv[0].replace(/\\/g, '\\\\');
        const escapedCwd = process.cwd().replace(/\\/g, '\\\\');
        
        const cmd = `setTimeout(() => {
            const { spawn } = require('child_process');
            const child = spawn('${escapedNode}', ['server.js'], {
                detached: true,
                stdio: 'ignore',
                cwd: '${escapedCwd}'
            });
            child.unref();
        }, 1500);`;
        
        const helper = spawn(process.argv[0], ['-e', cmd], {
            detached: true,
            stdio: 'ignore'
        });
        helper.unref();
        
        // Close Puppeteer browser cleanly before exit
        if (browser) {
            await browser.close().catch(() => {});
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Auto-update: Update failed:', error.message);
    }
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
        ignoreDefaultArgs: ['--enable-automation'], // Hide "controlled by automated test software" bar
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

                // Neutralize transforms AND overflow:hidden on all ancestors.
                // overflow:hidden on a parent clips position:fixed children in many browsers.
                let p = best.parentElement;
                while (p && p !== document.body) {
                    const cs = getComputedStyle(p);
                    if (cs.transform !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none') {
                        p.style.setProperty('transform', 'none', 'important');
                        p.style.setProperty('filter', 'none', 'important');
                        p.style.setProperty('perspective', 'none', 'important');
                    }
                    if (cs.overflow === 'hidden' || cs.overflow === 'clip' ||
                        cs.overflowX === 'hidden' || cs.overflowY === 'hidden') {
                        p.style.setProperty('overflow', 'visible', 'important');
                    }
                    p = p.parentElement;
                }

                // Use setProperty with 'important' so site JS cannot override us
                // with plain style assignments (e.g. el.style.width = '...' loses to !important)
                best.style.setProperty('position', 'fixed', 'important');
                best.style.setProperty('top', '0', 'important');
                best.style.setProperty('left', '0', 'important');
                best.style.setProperty('width', '100vw', 'important');
                best.style.setProperty('height', '100vh', 'important');
                best.style.setProperty('z-index', '2147483647', 'important');
                best.style.setProperty('background', '#000', 'important');
                best.style.setProperty('margin', '0', 'important');
                best.style.setProperty('padding', '0', 'important');
                best.style.setProperty('border', 'none', 'important');
                best.style.setProperty('max-width', 'none', 'important');
                best.style.setProperty('max-height', 'none', 'important');
                best.removeAttribute('width');
                best.removeAttribute('height');
                document.documentElement.style.setProperty('overflow', 'hidden', 'important');
                document.body.style.setProperty('overflow', 'hidden', 'important');
                if (best.tagName === 'VIDEO' && best.paused) {
                    best.play().catch(() => {});
                }
            };

            // Run every 500ms so we re-apply faster than site JS can fight back
            window.__fsWatcher = setInterval(maximize, 500);
            maximize();
        });
        console.log('Fullscreen watcher installed');
    } catch (error) {
        console.error('Fullscreen error:', error.message);
    }
}

// Virtual mouse cursor for sites without arrow-key navigation (e.g. Netflix).
// The D-pad moves it, OK clicks. Repeated taps accelerate. A dot is drawn on
// the page since synthetic mouse events have no visible OS pointer.
const cursor = { x: 640, y: 360, step: 30, lastMove: 0, lastDir: null };
const CURSOR_DIRS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]
};

async function drawCursor(visible) {
    await page.evaluate((x, y, show) => {
        let dot = document.getElementById('__remoteCursor');
        if (!show) { if (dot) dot.remove(); return; }
        if (!dot) {
            dot = document.createElement('div');
            dot.id = '__remoteCursor';
            Object.assign(dot.style, {
                position: 'fixed',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.85)',
                border: '2px solid rgba(0,0,0,0.6)',
                zIndex: '2147483647',
                pointerEvents: 'none',
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 6px rgba(0,0,0,0.7)'
            });
            document.body.appendChild(dot);
        }
        dot.style.left = x + 'px';
        dot.style.top = y + 'px';
    }, cursor.x, cursor.y, visible).catch(() => {});
}

async function moveCursor(direction) {
    if (!page || !CURSOR_DIRS[direction]) return;
    const now = Date.now();
    // Accelerate while tapping the same direction quickly, reset otherwise
    if (direction === cursor.lastDir && now - cursor.lastMove < 500) {
        cursor.step = Math.min(cursor.step * 1.5, 240);
    } else {
        cursor.step = 30;
    }
    cursor.lastDir = direction;
    cursor.lastMove = now;

    const size = await page.evaluate(() => ({ w: innerWidth, h: innerHeight })).catch(() => ({ w: 1280, h: 720 }));
    const [dx, dy] = CURSOR_DIRS[direction];
    cursor.x = Math.max(0, Math.min(size.w - 1, cursor.x + dx * cursor.step));
    cursor.y = Math.max(0, Math.min(size.h - 1, cursor.y + dy * cursor.step));

    await page.mouse.move(cursor.x, cursor.y).catch(() => {});
    await drawCursor(true);
}

async function clickCursor() {
    if (!page) return;
    await page.mouse.click(cursor.x, cursor.y).catch(() => {});
    await drawCursor(true);
}

async function moveCursorDelta(dx, dy) {
    if (!page) return;
    const size = await page.evaluate(() => ({ w: innerWidth, h: innerHeight })).catch(() => ({ w: 1280, h: 720 }));
    cursor.x = Math.max(0, Math.min(size.w - 1, cursor.x + dx));
    cursor.y = Math.max(0, Math.min(size.h - 1, cursor.y + dy));
    await page.mouse.move(cursor.x, cursor.y).catch(() => {});
    await drawCursor(true);
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
                    if (data.fullscreen) {
                        // Fire immediately in case the player is already there
                        await enterFullscreen();

                        // After 2s, double-click the center of the screen to trigger the
                        // player's own native fullscreen (e.g. Show TV needs this dblclick)
                        setTimeout(async () => {
                            try {
                                const vp = page.viewport() || { width: 1920, height: 1080 };
                                const cx = Math.round(vp.width / 2);
                                const cy = Math.round(vp.height / 2);
                                await page.mouse.click(cx, cy, { clickCount: 2 });
                                console.log(`Auto double-click at center (${cx},${cy}) to trigger player fullscreen`);
                                // Re-apply CSS fullscreen after the click in case it shifts layout
                                await enterFullscreen();
                            } catch (e) {
                                console.error('Auto double-click failed:', e.message);
                            }
                        }, 2000);

                        // Keep retrying CSS fullscreen for up to 20s for late-loading players
                        let retries = 0;
                        const fsRetry = setInterval(async () => {
                            retries++;
                            try {
                                const hasVideo = await page.evaluate(() => {
                                    const els = Array.from(document.querySelectorAll('video'));
                                    return els.some(v => {
                                        const r = v.getBoundingClientRect();
                                        return r.width > 200 && r.height > 150;
                                    });
                                });
                                if (hasVideo || retries >= 13) {
                                    clearInterval(fsRetry);
                                }
                                await enterFullscreen();
                            } catch (e) {
                                clearInterval(fsRetry);
                            }
                        }, 1500);
                    }
                    break;
                case 'FULLSCREEN':
                    await enterFullscreen();
                    break;
                case 'CURSOR_MOVE':
                    await moveCursor(data.key);
                    break;
                case 'CURSOR_CLICK':
                    await clickCursor();
                    break;
                case 'CURSOR_HIDE':
                    await drawCursor(false);
                    break;
                case 'CURSOR_MOVE_DELTA':
                    await moveCursorDelta(data.dx, data.dy);
                    break;
                case 'SCROLL':
                    if (page) {
                        await page.mouse.wheel({ deltaY: data.deltaY }).catch(async () => {
                            // Fallback to window scroll if mouse wheel fails
                            await page.evaluate((dy) => window.scrollBy(0, dy), data.deltaY).catch(() => {});
                        });
                    }
                    break;
                case 'VOLUME': {
                    const delta = data.key === '+' ? 0.1 : -0.1;
                    const candidates = [];
                    
                    // 1) Find the best video candidate in each frame
                    for (const frame of page.frames()) {
                        try {
                            const info = await frame.evaluate(() => {
                                const vids = Array.from(document.querySelectorAll('video'));
                                if (vids.length === 0) return null;
                                
                                let bestIndex = -1;
                                let bestScore = -1;
                                let bestVol = 1.0;
                                
                                vids.forEach((v, index) => {
                                    const r = v.getBoundingClientRect();
                                    const area = r.width * r.height;
                                    // Ignore completely hidden/zero-sized video trackers
                                    if (area <= 0) return;
                                    
                                    const isPlaying = !v.paused && !v.ended && v.readyState >= 2;
                                    // Score: playing gets huge boost, then sort by visible screen area
                                    const score = (isPlaying ? 1000000 : 0) + area;
                                    if (score > bestScore) {
                                        bestScore = score;
                                        bestIndex = index;
                                        bestVol = v.volume;
                                    }
                                });
                                
                                if (bestIndex === -1) return null;
                                return { index: bestIndex, score: bestScore, volume: bestVol };
                            });
                            
                            if (info) {
                                candidates.push({ frame, info });
                            }
                        } catch (e) {
                            // Frame detached or inaccessible due to CORS
                        }
                    }
                    
                    // 2) Sort candidates by score descending and take the winner
                    candidates.sort((a, b) => b.info.score - a.info.score);
                    const winner = candidates[0];
                    
                    if (winner) {
                        await winner.frame.evaluate((index, d) => {
                            const v = document.querySelectorAll('video')[index];
                            if (!v) return;
                            
                            v.muted = false;
                            const newVol = Math.max(0, Math.min(1, Math.round((v.volume + d) * 10) / 10));
                            v.volume = newVol;
                            
                            // Dispatch volumechange event so custom player UI (like YouTube/Twitch) knows it updated
                            v.dispatchEvent(new Event('volumechange', { bubbles: true }));
                            
                            // Flash the volume overlay indicator on the TV screen
                            let o = document.getElementById('__volOverlay');
                            if (!o) {
                                o = document.createElement('div');
                                o.id = '__volOverlay';
                                Object.assign(o.style, {
                                    position: 'fixed',
                                    bottom: '40px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    zIndex: '2147483647',
                                    background: 'rgba(0,0,0,0.75)',
                                    color: '#fff',
                                    font: 'bold 22px sans-serif',
                                    padding: '8px 20px',
                                    borderRadius: '10px',
                                    pointerEvents: 'none'
                                });
                                document.body.appendChild(o);
                            }
                            o.textContent = '🔊 ' + Math.round(newVol * 100) + '%';
                            o.style.display = 'block';
                            clearTimeout(window.__volTimer);
                            window.__volTimer = setTimeout(() => { o.style.display = 'none'; }, 1200);
                        }, winner.info.index, delta).catch(e => console.log('Error updating winner volume:', e.message));
                    }
                    break;
                }
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
        const lowerName = name.toLowerCase();
        if (lowerName.includes('warp') || lowerName.includes('tailscale') || lowerName.includes('vpn')) {
            continue;
        }
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
    
    // Advertise the Smart TV Remote service via mDNS
    try {
        const bonjour = new Bonjour();
        bonjour.publish({
            name: `Smart TV Remote (${ip})`,
            type: 'smarttvremote',
            protocol: 'tcp',
            port: PORT,
            txt: {
                ip: ip,
                port: PORT.toString()
            }
        });
        console.log(`Advertised mDNS service: Smart TV Remote (${ip}) on port ${PORT}`);
    } catch (e) {
        console.error('Failed to advertise mDNS service:', e.message);
    }
    
    await launchBrowser();
});
