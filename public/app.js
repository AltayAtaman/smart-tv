let socket;
let laptopIP = localStorage.getItem('laptopIP') || window.location.hostname;

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

async function discoverServer() {
    if (isDiscovering) return false;
    isDiscovering = true;
    
    console.log("Checking if running in Capacitor...");
    const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    const titleEl = document.querySelector('h1');
    
    if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.mDNS) {
        console.log("Capacitor & mDNS plugin found. Starting discovery...");
        if (titleEl) {
            titleEl.textContent = 'Searching...';
            titleEl.style.color = '#ffc107'; // Yellow
        }
        
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
                    
                    if (titleEl) {
                        titleEl.textContent = 'Smart TV';
                    }
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
    
    if (titleEl) {
        titleEl.textContent = 'Smart TV';
        titleEl.style.color = '#e62117'; // Red for disconnected
    }
    isDiscovering = false;
    return false;
}

function initSocket() {
    if (socket) socket.disconnect();
    
    // Connect to the specific IP if available, otherwise fallback to current host
    const connectionUrl = laptopIP.startsWith('http') ? laptopIP : `http://${laptopIP}:3000`;
    console.log(`Connecting to: ${connectionUrl}`);
    
    socket = io(connectionUrl, {
        reconnectionAttempts: 2,
        timeout: 4000
    });

    socket.on('connect', () => {
        console.log('Connected to Smart TV');
        const titleEl = document.querySelector('h1');
        if (titleEl) {
            titleEl.style.color = '#28a745'; // Green
            titleEl.textContent = 'Smart TV';
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Smart TV');
        const titleEl = document.querySelector('h1');
        if (titleEl) {
            titleEl.style.color = '#e62117'; // Red
            titleEl.textContent = 'Smart TV';
        }
    });

    socket.on('connect_error', () => {
        console.log('Connection failed. Attempting mDNS discovery...');
        const titleEl = document.querySelector('h1');
        if (titleEl) {
            titleEl.style.color = '#ffc107'; // Yellow
        }
        discoverServer();
    });
}

// Cursor mode: D-pad moves a mouse pointer on the TV instead of sending
// arrow keys — for sites without keyboard navigation (e.g. Netflix)
let cursorMode = localStorage.getItem('cursorMode') === 'true';

function toggleCursorMode() {
    cursorMode = !cursorMode;
    localStorage.setItem('cursorMode', cursorMode);
    updateCursorButton();
    if (!cursorMode) sendCommand('CURSOR_HIDE');
}

function updateCursorButton() {
    const btn = document.getElementById('cursorBtn');
    if (btn) btn.classList.toggle('active', cursorMode);
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
    if ('vibrate' in navigator) navigator.vibrate(50);
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
    const ipInput = document.getElementById('ipInput');
    ipInput.value = laptopIP;
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function saveSettings() {
    const newIP = document.getElementById('ipInput').value.trim();
    if (newIP) {
        laptopIP = newIP;
        localStorage.setItem('laptopIP', laptopIP);
        toggleSettings();
        initSocket();
    }
}

// Channels Panel Logic
function toggleChannels() {
    const modal = document.getElementById('channelsModal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function renderChannels() {
    const list = document.getElementById('channelList');
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
