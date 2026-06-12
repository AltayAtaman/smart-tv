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
        args: [
            '--start-fullscreen',
            '--kiosk', // Optional: removes browser UI
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ],
        defaultViewport: null // Use the actual screen size
    });
    
    const pages = await browser.pages();
    page = pages[0];
    
    // Set a User Agent to trick sites into TV mode if possible
    await page.setUserAgent('Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36');
    
    await page.goto('https://www.youtube.com/tv', { waitUntil: 'networkidle2' }).catch(e => console.log("Initial navigation error:", e.message));
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
                    await page.goto(data.url, { waitUntil: 'networkidle2' });
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
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

server.listen(PORT, '0.0.0.0', async () => {
    const ip = getLocalIp();
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Mobile Remote URL: http://${ip}:${PORT}`);
    console.log(`To control, open the Mobile Remote URL on your phone.`);
    await launchBrowser();
});
