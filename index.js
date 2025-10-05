'use strict';

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');

// Import the interface to Tessel hardware
const tessel = require('tessel');

/*
 * CW Key Circuit Diagram
 *
 * Tessel 2 Port A:
 *
 *     ┌─────────────────────────────────────┐
 *     │ [GND] [3.3V] [0] [1] [2] [3] [4] …  │
 *     └─────────────────────┬───────┬───┬───┘
 *                           │       │   │
 *                           │       │   │ Pin 6 (Paddle DAH input)
 *                           │       │
 *                           │       │ Pin 5 (Paddle DIT input)
 *                           │
 *                           │ Pin 2 (Straight Key input)
 *                           │
 *                        ┌──┴──┐ ┌──┴──┐ ┌──┴──┐
 *                        │  O  │ │  O  │ │  O  │
 *                        └──┬──┘ └──┬──┘ └──┬──┘
 *                           │       │       │
 *     ┌─────────────────────┴───────┴───────┴───┐
 *     │ [GND] …                                 │
 *     └─────────────────────────────────────────┘
 *
 * All pins pulled up to 3.3V, active LOW when closed
 * Note: Pins 2, 5, 6, 7 support interrupts (required for .on('change'))
 */

// Straight Key Configuration
const keyPin = tessel.port.A.pin[2];
keyPin.input();
keyPin.pull('pullup');
const keyLED = tessel.led[2];

// Paddle Configuration
const ditPin = tessel.port.A.pin[7];
const ditLED = tessel.led[1];

const dahPin = tessel.port.A.pin[5];
const dahLED = tessel.led[3];

// Configure paddle pins with proper async pull callbacks
ditPin.input();
ditPin.pull('pullup', (error) => {
	if (error) throw error;
	console.log('DIT pin pull-up configured');

	// Set up event handler after pull is configured
	ditPin.on('change', (value) => {
		console.log('>>> DIT pin change event, value:', value);
		keyerState.ditPressed = value === 0;
		if (keyerState.ditPressed) {
			checkPaddles();
		}
	});
});

dahPin.input();
dahPin.pull('pullup', (error) => {
	if (error) throw error;
	console.log('DAH pin pull-up configured');

	// Set up event handler after pull is configured
	dahPin.on('change', (value) => {
		console.log('>>> DAH pin change event, value:', value);
		keyerState.dahPressed = value === 0;
		if (keyerState.dahPressed) {
			checkPaddles();
		}
	});
});

// Keyer timing configuration (in milliseconds)
const WPM = 20; // Words per minute
const UNIT_TIME = 1200 / WPM; // Standard PARIS timing
const DIT_TIME = UNIT_TIME;
const DAH_TIME = UNIT_TIME * 3;
const ELEMENT_SPACE = UNIT_TIME;

// Store SSE clients
const sseClients = [];

console.log('CW Keyer ready.');
console.log('Straight key: Port A Pin 2 to GND');
console.log('Paddle DIT: Port A Pin 7 to GND');
console.log('Paddle DAH: Port A Pin 5 to GND');

// Broadcast key state to all SSE clients
function broadcastKeyState(keyDown, timestamp) {
	const data = JSON.stringify({ keyDown, timestamp });
	sseClients.forEach((client) => {
		client.write(`data: ${data}\n\n`);
	});
}

// Broadcast paddle event to all SSE clients
function broadcastPaddleEvent(type, duration, timestamp) {
	const data = JSON.stringify({ type, duration, timestamp });
	sseClients.forEach((client) => {
		client.write(`data: ${data}\n\n`);
	});
}

// Paddle keyer state
let keyerState = {
	isKeying: false,
	currentElement: null, // 'dit' or 'dah'
	ditPressed: false,
	dahPressed: false,
	keyerTimer: null,
};

// Debounce timers
let ditDebounceTimer = null;
let dahDebounceTimer = null;
const DEBOUNCE_MS = 10;

// Send a dit or dah
function sendElement(element) {
	console.log('sendElement:', element);
	if (keyerState.isKeying) return; // Already sending

	keyerState.isKeying = true;
	keyerState.currentElement = element;

	const duration = element === 'dit' ? DIT_TIME : DAH_TIME;
	const led = element === 'dit' ? ditLED : dahLED;

	// Turn on LED and broadcast start
	led.on();
	broadcastPaddleEvent(element, duration, Date.now());

	// Schedule element end
	keyerState.keyerTimer = setTimeout(() => {
		led.off();
		keyerState.isKeying = false;
		keyerState.currentElement = null;

		// Check if we should send another element
		setTimeout(() => {
			checkPaddles();
		}, ELEMENT_SPACE);
	}, duration);
}

// Check paddle state and send appropriate element
function checkPaddles() {
	console.log(
		'checkPaddles - isKeying:',
		keyerState.isKeying,
		'dit:',
		keyerState.ditPressed,
		'dah:',
		keyerState.dahPressed
	);
	if (keyerState.isKeying) return;

	// Iambic mode: alternate if both pressed
	if (keyerState.ditPressed && keyerState.dahPressed) {
		// Send opposite of last element, or dit if starting
		if (keyerState.currentElement === 'dit') {
			sendElement('dah');
		} else {
			sendElement('dit');
		}
	} else if (keyerState.ditPressed) {
		sendElement('dit');
	} else if (keyerState.dahPressed) {
		sendElement('dah');
	}
}

// Monitor pin state and control LED
keyPin.on(
	'change',
	/** @param {number} value - Pin value: 0 (LOW) or 1 (HIGH) */
	(value) => {
		// Pin reads LOW (0) when key is closed, HIGH (1) when open
		const keyDown = value === 0;
		if (keyDown) {
			keyLED.on();
		} else {
			keyLED.off();
		}
		// Broadcast to web clients
		broadcastKeyState(keyDown, Date.now());
	}
);

const port = 80;

const server = http
	.createServer((request, response) => {
		// Handle SSE endpoint
		if (request.url === '/events') {
			response.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			});

			// Add client to list
			sseClients.push(response);
			console.log(`SSE client connected. Total clients: ${sseClients.length}`);

			// Send initial connection message
			response.write(
				`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`
			);

			// Remove client on disconnect
			request.on('close', () => {
				const index = sseClients.indexOf(response);
				if (index !== -1) {
					sseClients.splice(index, 1);
					console.log(
						`SSE client disconnected. Total clients: ${sseClients.length}`
					);
				}
			});

			return;
		}

		// Serve static files
		let filePath = request.url === '/' ? '/index.html' : request.url;
		filePath = path.join(__dirname, 'public', filePath);

		const extname = path.extname(filePath);
		const contentType =
			{
				'.html': 'text/html',
				'.js': 'application/javascript',
				'.css': 'text/css',
			}[extname] || 'text/plain';

		fs.readFile(filePath, (err, content) => {
			if (err) {
				response.writeHead(404);
				response.end('Not Found');
			} else {
				response.writeHead(200, { 'Content-Type': contentType });
				response.end(content);
			}
		});
	})
	.listen(port, () => console.log(`http://${os.hostname()}.local:${port}`));

process.on('SIGINT', (_) => server.close());
