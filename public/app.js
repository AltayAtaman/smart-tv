const socket = io();

function sendCommand(type, key = null) {
    console.log(`Sending command: ${type} ${key || ''}`);
    socket.emit('command', { type, key });
    
    // Provide haptic feedback if available
    if ('vibrate' in navigator) {
        navigator.vibrate(50);
    }
}

function sendText() {
    const input = document.getElementById('searchInput');
    const text = input.value;
    if (text) {
        console.log(`Sending text: ${text}`);
        socket.emit('command', { type: 'TYPE', text });
        input.value = '';
        input.blur(); // Hide keyboard
    }
}

function navigate(url) {
    console.log(`Navigating to: ${url}`);
    socket.emit('command', { type: 'NAVIGATE', url });
}

// Optional: Handle keyboard events from a physical keyboard (useful for testing on PC)
document.addEventListener('keydown', (e) => {
    const keys = {
        ArrowUp: 'ArrowUp',
        ArrowDown: 'ArrowDown',
        ArrowLeft: 'ArrowLeft',
        ArrowRight: 'ArrowRight',
        Enter: 'Enter',
        Backspace: 'Backspace'
    };

    if (keys[e.key]) {
        // Prevent default browser behavior for arrow keys if needed
        // e.preventDefault();
        sendCommand('KEY_PRESS', keys[e.key]);
    }
});
