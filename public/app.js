let socket;
let laptopIP = localStorage.getItem('laptopIP') || window.location.hostname;

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

function navigate(url) {
    socket.emit('command', { type: 'NAVIGATE', url });
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
