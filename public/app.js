const CLIENT_VERSION = '1.0.0';
let socket;
let laptopIP = localStorage.getItem('laptopIP') || window.location.hostname;
let linuxMAC = localStorage.getItem('linuxMAC') || '';

const CHANNELS = [
    { name: 'YouTube TV', url: 'https://www.youtube.com/tv', color: '#e62117', category: 'Streaming' },
    { name: 'Netflix',    url: 'https://www.netflix.com',    color: '#e50914', category: 'Streaming' },
    { name: 'Twitch',     url: 'https://www.twitch.tv',      color: '#9146ff', category: 'Streaming' },
    { name: 'Disney+',    url: 'https://www.disneyplus.com', color: '#113ccf', category: 'Streaming' },
    { name: 'Kick',       url: 'https://kick.com',           color: '#0e8a2f', category: 'Streaming' },
    { name: 'HBO Max',    url: 'https://www.hbomax.com/tr/', color: '#002be7', category: 'Streaming' },
    { name: 'Exxen',      url: 'https://www.exxen.com',      color: '#c79100', category: 'Streaming' },
    { name: 'TRT 1',      url: 'https://www.tabii.com/tr/watch/live/trt1',   color: '#0a7c5f', category: 'TV', fullscreen: true },
    { name: 'Kanal D',    url: 'https://www.kanald.com.tr/canli-yayin',      color: '#c00',    category: 'TV', fullscreen: true },
    { name: 'Show TV',    url: 'https://www.showtv.com.tr/canli-yayin',      color: '#d91d5c', category: 'TV', fullscreen: true },
    { name: 'NOW',        url: 'https://www.nowtv.com.tr/canli-yayin',       color: '#7a1fa2', category: 'TV', fullscreen: true },
    { name: 'CNN Türk',   url: 'https://www.cnnturk.com/canli-yayin',        color: '#b00',    category: 'TV', fullscreen: true },
    { name: 'NTV',        url: 'https://www.ntv.com.tr/canli-yayin',         color: '#1f5fa8', category: 'TV', fullscreen: true },
    { name: 'Habertürk',  url: 'https://www.haberturk.com/canliyayin',       color: '#444',    category: 'TV', fullscreen: true }
];

let isDiscovering = false;

function updateStatus(status, text) {
    const dot = document.getElementById('statusDot');
    if (dot) {
        dot.className = 'status-dot ' + status;
    }
    const titleEl = document.querySelector('h1');
    if (titleEl && text) {
        titleEl.textContent = text;
        if (status === 'connected') titleEl.style.color = '';
        else if (status === 'searching') titleEl.style.color = '#ffc107';
        else if (status === 'disconnected') titleEl.style.color = '#e62117';
    }
}

async function discoverServer() {
    if (isDiscovering) return false;
    isDiscovering = true;
    
    console.log("Checking if running in Capacitor...");
    const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    
    if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.mDNS) {
        console.log("Capacitor & mDNS plugin found. Starting discovery...");
        updateStatus('searching', 'Searching...');
        
        try {
            const mDNS = window.Capacitor.Plugins.mDNS;
            const result = await mDNS.discover({
                type: '_smarttvremote._tcp',
                domain: 'local'
            });
            
            console.log("Discovery result:", result);
            if (result && result.services && result.services.length > 0) {
                const service = result.services[0];
                const ip = service.addresses && service.addresses.length > 0 
                    ? service.addresses.find(addr => !addr.includes(':')) || service.addresses[0]
                    : null;
                const port = service.port || 3000;
                
                if (ip) {
                    console.log(`Discovered Smart TV Remote at http://${ip}:${port}`);
                    laptopIP = ip;
                    localStorage.setItem('laptopIP', laptopIP);
                    
                    updateStatus('connected', 'Smart TV');
                    isDiscovering = false;
                    initSocket();
                    return true;
                }
            }
            console.log("No services found on this scan.");
        } catch (error) {
            console.error("mDNS discovery error:", error);
        }
    } else {
        console.log("Not running in native Capacitor or mDNS plugin unavailable.");
    }
    
    updateStatus('disconnected', 'Smart TV');
    isDiscovering = false;
    return false;
}

function initSocket() {
    if (socket) socket.disconnect();
    
    const connectionUrl = laptopIP.startsWith('http') ? laptopIP : `http://${laptopIP}:3000`;
    console.log(`Connecting to: ${connectionUrl}`);
    
    socket = io(connectionUrl, {
        reconnectionAttempts: 2,
        timeout: 4000
    });

    socket.on('connect', () => {
        console.log('Connected to Smart TV');
        updateStatus('connected', 'Smart TV');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Smart TV');
        updateStatus('disconnected', 'Smart TV');
    });

    socket.on('connect_error', () => {
        console.log('Connection failed. Attempting mDNS discovery...');
        updateStatus('searching', 'Searching...');
        discoverServer();
    });
}

// Cursor mode: toggles between D-pad layout and relative Touchpad trackpad
let cursorMode = localStorage.getItem('cursorMode') === 'true';

function toggleCursorMode() {
    cursorMode = !cursorMode;
    localStorage.setItem('cursorMode', cursorMode);
    updateCursorButton();
    updatePanelVisibility();
    if (!cursorMode) sendCommand('CURSOR_HIDE');
}

function updateCursorButton() {
    const btn = document.getElementById('cursorBtn');
    if (btn) btn.classList.toggle('active', cursorMode);
}

function updatePanelVisibility() {
    const dpadPanel = document.getElementById('dpadPanel');
    const touchpadPanel = document.getElementById('touchpadPanel');
    if (cursorMode) {
        if (dpadPanel) dpadPanel.classList.remove('active');
        if (touchpadPanel) touchpadPanel.classList.add('active');
    } else {
        if (dpadPanel) dpadPanel.classList.add('active');
        if (touchpadPanel) touchpadPanel.classList.remove('active');
    }
}

function initTouchpad() {
    const touchpad = document.getElementById('touchpad');
    if (!touchpad) return;

    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let hasMoved = false;
    let isScrolling = false;
    let lastScrollY = 0;

    const SENSITIVITY = 1.6;

    touchpad.addEventListener('touchstart', (e) => {
        const touches = e.touches;
        if (touches.length === 1) {
            lastX = touches[0].clientX;
            lastY = touches[0].clientY;
            startX = lastX;
            startY = lastY;
            hasMoved = false;
            isScrolling = false;
        } else if (touches.length === 2) {
            isScrolling = true;
            lastScrollY = (touches[0].clientY + touches[1].clientY) / 2;
        }
    }, { passive: true });

    touchpad.addEventListener('touchmove', (e) => {
        const touches = e.touches;
        if (isScrolling && touches.length === 2) {
            const currentScrollY = (touches[0].clientY + touches[1].clientY) / 2;
            const deltaY = lastScrollY - currentScrollY; // scroll delta
            
            if (Math.abs(deltaY) > 1) {
                socket.emit('command', { type: 'SCROLL', deltaY: Math.round(deltaY * 2.0) });
                lastScrollY = currentScrollY;
            }
        } else if (touches.length === 1 && !isScrolling) {
            const clientX = touches[0].clientX;
            const clientY = touches[0].clientY;
            const dx = (clientX - lastX) * SENSITIVITY;
            const dy = (clientY - lastY) * SENSITIVITY;

            if (Math.abs(clientX - startX) > 6 || Math.abs(clientY - startY) > 6) {
                hasMoved = true;
            }

            socket.emit('command', { type: 'CURSOR_MOVE_DELTA', dx: Math.round(dx), dy: Math.round(dy) });

            lastX = clientX;
            lastY = clientY;
        }
    }, { passive: true });

    touchpad.addEventListener('touchend', (e) => {
        if (!hasMoved && !isScrolling) {
            socket.emit('command', { type: 'CURSOR_CLICK' });
            
            // Touch ripple effect animation
            const ripple = document.createElement('div');
            ripple.className = 'touch-ripple';
            Object.assign(ripple.style, {
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '60px',
                height: '60px',
                background: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '50%',
                transform: 'translate(-50%, -50%) scale(0)',
                pointerEvents: 'none',
                animation: 'rippleEffect 0.4s ease-out'
            });
            touchpad.appendChild(ripple);
            setTimeout(() => ripple.remove(), 400);

            if ('vibrate' in navigator) navigator.vibrate(40);
        }
        isScrolling = false;
        hasMoved = false;
    }, { passive: true });
}

function dpad(key) {
    if (cursorMode && key !== 'Enter') {
        sendCommand('CURSOR_MOVE', key);
    } else if (cursorMode && key === 'Enter') {
        sendCommand('CURSOR_CLICK');
    } else {
        sendCommand('KEY_PRESS', key);
    }
}

function sendCommand(type, key = null) {
    if (!socket || !socket.connected) {
        alert("Not connected! Check settings.");
        return;
    }
    socket.emit('command', { type, key });
    if ('vibrate' in navigator) navigator.vibrate(35);
}

function sendText() {
    const input = document.getElementById('searchInput');
    const text = input.value;
    if (text) {
        socket.emit('command', { type: 'TYPE', text });
        socket.emit('command', { type: 'KEY_PRESS', key: 'Enter' }); // Auto-Enter
        input.value = '';
        input.blur();
    }
}

function navigate(url, fullscreen = false) {
    socket.emit('command', { type: 'NAVIGATE', url, fullscreen });
}

// Settings Modal Logic
function toggleSettings() {
    const modal = document.getElementById('settingsModal');
    document.getElementById('ipInput').value = laptopIP;
    document.getElementById('macInput').value = linuxMAC;
    document.getElementById('powerStatus').textContent = '';
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function saveSettings() {
    const newIP = document.getElementById('ipInput').value.trim();
    const newMAC = document.getElementById('macInput').value.trim();
    if (newIP) {
        laptopIP = newIP;
        localStorage.setItem('laptopIP', laptopIP);
    }
    if (newMAC) {
        linuxMAC = newMAC;
        localStorage.setItem('linuxMAC', linuxMAC);
    }
    toggleSettings();
    initSocket();
}

// Power Controls
async function sleepMachine() {
    const statusEl = document.getElementById('powerStatus');
    const connectionUrl = laptopIP.startsWith('http') ? laptopIP : `http://${laptopIP}:3000`;
    statusEl.textContent = 'Sending sleep command...';
    statusEl.style.color = '#ffc107';
    try {
        await fetch(`${connectionUrl}/api/sleep`, { method: 'POST' });
        statusEl.textContent = 'Machine is going to sleep. 😴';
        statusEl.style.color = '#28a745';
        updateStatus('disconnected', 'Smart TV');
    } catch (e) {
        statusEl.textContent = 'Failed: ' + e.message;
        statusEl.style.color = '#e62117';
    }
}

async function wakeMachine() {
    const statusEl = document.getElementById('powerStatus');
    if (!linuxMAC) {
        statusEl.textContent = 'No MAC address set. Enter it above and Save first.';
        statusEl.style.color = '#ffc107';
        return;
    }
    statusEl.textContent = 'Sending magic packet... ⏰';
    statusEl.style.color = '#ffc107';

    // Derive subnet broadcast from stored IP (e.g. 192.168.1.5 → 192.168.1.255)
    const ipParts = laptopIP.replace(/^https?:\/\//, '').split(':')[0].split('.');
    const broadcast = ipParts.length === 4
        ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.255`
        : '255.255.255.255';

    const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();

    if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.WakeOnLan) {
        // Native path: send UDP magic packet directly from Android (works even when server is off)
        try {
            await window.Capacitor.Plugins.WakeOnLan.wake({ mac: linuxMAC, broadcast });
            statusEl.textContent = `Magic packet sent to ${broadcast}! Waiting for machine to wake...`;
            statusEl.style.color = '#28a745';
        } catch (e) {
            statusEl.textContent = 'WoL failed: ' + e.message;
            statusEl.style.color = '#e62117';
            return;
        }
    } else {
        // Browser fallback: relay through the server (server must be running)
        const connectionUrl = laptopIP.startsWith('http') ? laptopIP : `http://${laptopIP}:3000`;
        try {
            const res = await fetch(`${connectionUrl}/api/wake`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac: linuxMAC, broadcast })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            statusEl.textContent = 'Magic packet sent via server relay!';
            statusEl.style.color = '#28a745';
        } catch (e) {
            statusEl.textContent = 'Server offline — install the APK to wake without a relay.';
            statusEl.style.color = '#e62117';
            return;
        }
    }

    // Auto-retry connection every 3s for up to 30s
    let attempts = 0;
    const retryConnect = setInterval(() => {
        attempts++;
        initSocket();
        if (attempts >= 10) {
            clearInterval(retryConnect);
            statusEl.textContent = 'Could not reconnect. Machine may need more time.';
            statusEl.style.color = '#ffc107';
        }
    }, 3000);
}

// Channels Panel Logic
function toggleChannels() {
    const modal = document.getElementById('channelsModal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function renderChannels() {
    const list = document.getElementById('channelList');
    list.innerHTML = ''; // clear first
    let currentCategory = null;
    CHANNELS.forEach((channel) => {
        if (channel.category !== currentCategory) {
            currentCategory = channel.category;
            const title = document.createElement('div');
            title.className = 'channel-group-title';
            title.textContent = currentCategory;
            list.appendChild(title);
        }
        const btn = document.createElement('button');
        btn.className = 'channel-btn';
        btn.textContent = channel.name;
        btn.style.background = channel.color;
        btn.onclick = () => {
            navigate(channel.url, channel.fullscreen === true);
            toggleChannels();
        };
        list.appendChild(btn);
    });
}

renderChannels();
updateCursorButton();
updatePanelVisibility();
initTouchpad();

// Initial connection
(async () => {
    const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (isNative && (!laptopIP || laptopIP === 'localhost' || laptopIP === '127.0.0.1')) {
        const found = await discoverServer();
        if (!found) {
            if (laptopIP && laptopIP !== 'localhost') {
                initSocket();
            } else {
                toggleSettings();
            }
        }
    } else {
        if (laptopIP) {
            initSocket();
        } else {
            toggleSettings();
        }
    }
})();

// Keyboard shortcuts for testing
document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    const keys = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Enter: 'Enter', Backspace: 'Backspace' };
    if (e.key === 'Backspace') sendCommand('KEY_PRESS', 'Backspace');
    else if (keys[e.key]) dpad(e.key);
});

async function checkClientUpdate() {
    const statusEl = document.getElementById('clientUpdateStatus');
    statusEl.textContent = 'Checking...';
    statusEl.style.color = '#aaa';
    
    const connectionUrl = laptopIP.startsWith('http') ? laptopIP : `http://${laptopIP}:3000`;
    try {
        const res = await fetch(`${connectionUrl}/api/version`);
        if (!res.ok) throw new Error('Server responded with error');
        const data = await res.json();
        
        const serverVer = data.serverVersion;
        if (compareVersions(CLIENT_VERSION, serverVer) < 0) {
            statusEl.textContent = `Update available! v${CLIENT_VERSION} -> v${serverVer}`;
            statusEl.style.color = '#ffc107'; // Yellow
            
            if (confirm(`New APK update available (v${serverVer}). Would you like to download and install it?`)) {
                window.open(`${connectionUrl}/app.apk`, '_system');
            }
        } else {
            statusEl.textContent = `App is up to date (v${CLIENT_VERSION})`;
            statusEl.style.color = '#28a745'; // Green
        }
    } catch (e) {
        statusEl.textContent = 'Failed to check: ' + e.message;
        statusEl.style.color = '#e62117'; // Red
    }
}

async function checkServerUpdate() {
    const statusEl = document.getElementById('serverUpdateStatus');
    statusEl.textContent = 'Checking...';
    statusEl.style.color = '#aaa';
    
    const connectionUrl = laptopIP.startsWith('http') ? laptopIP : `http://${laptopIP}:3000`;
    try {
        const res = await fetch(`${connectionUrl}/api/version`);
        if (!res.ok) throw new Error('Server responded with error');
        const data = await res.json();
        
        if (!data.isGit) {
            statusEl.textContent = 'TV Server is not a Git repo. Auto-update disabled.';
            statusEl.style.color = '#e62117';
            return;
        }
        
        if (data.git && data.git.updateAvailable) {
            statusEl.textContent = `New commits available: ${data.git.localSha} -> ${data.git.remoteSha}`;
            statusEl.style.color = '#ffc107';
            
            if (confirm(`New TV Server updates available on GitHub. Would you like to pull updates and restart the TV server?`)) {
                statusEl.textContent = 'Updating TV Server... App will reconnect when done.';
                statusEl.style.color = '#ffc107';
                
                const updateRes = await fetch(`${connectionUrl}/api/update`, { method: 'POST' });
                if (!updateRes.ok) throw new Error('Update call failed');
                
                updateStatus('searching', 'Updating...');
            }
        } else if (data.git && data.git.error) {
            statusEl.textContent = `Git error: ${data.git.error}`;
            statusEl.style.color = '#e62117';
        } else {
            statusEl.textContent = `TV Server is up to date (commit ${data.git.localSha})`;
            statusEl.style.color = '#28a745';
        }
    } catch (e) {
        statusEl.textContent = 'Failed to check: ' + e.message;
        statusEl.style.color = '#e62117';
    }
}

function compareVersions(v1, v2) {
    const a = v1.split('.').map(Number);
    const b = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
    }
    return 0;
}
