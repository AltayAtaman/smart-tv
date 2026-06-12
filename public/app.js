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

function initSocket() {
    if (socket) socket.disconnect();
    
    // Connect to the specific IP if available, otherwise fallback to current host
    const connectionUrl = laptopIP.startsWith('http') ? laptopIP : `http://${laptopIP}:3000`;
    console.log(`Connecting to: ${connectionUrl}`);
    
    // We need to ensure socket.io is loaded. In a PWA it's usually at /socket.io/socket.io.js
    // In a standalone app, we might need to load it from the server.
    socket = io(connectionUrl);

    socket.on('connect', () => {
        console.log('Connected to Smart TV');
        document.querySelector('h1').style.color = '#28a745'; // Green for connected
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Smart TV');
        document.querySelector('h1').style.color = '#e62117'; // Red for disconnected
    });
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

// Initial connection
if (laptopIP) {
    initSocket();
} else {
    toggleSettings(); // Force settings if no IP
}

// Keyboard shortcuts for testing
document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    const keys = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Enter: 'Enter', Backspace: 'Backspace' };
    if (keys[e.key]) sendCommand('KEY_PRESS', keys[e.key]);
});
