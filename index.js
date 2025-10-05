"use strict";

const fs = require("fs");
const os = require("os");
const http = require("http");
const path = require("path");

// Import the interface to Tessel hardware
const tessel = require("tessel");

/*
 * CW Straight Key Circuit Diagram
 *
 * Tessel 2 Port A:
 *
 *     ┌─────────────────────────────────────┐
 *     │ [GND] [3.3V] [0] [1] [2] [3] [4] …  │
 *     └───────────────────────┬─────────────┘
 *                             │
 *                             │ Pin 2 (input with pull-up)
 *                             │
 *                          ┌──┴──┐
 *                          │  O  │  Straight Key
 *                          └──┬──┘
 *                             │
 *     ┌───────────────────────┴─────────────┐
 *     │ [GND] …                             │
 *     └─────────────────────────────────────┘
 *
 * Key open:  Pin 2 = HIGH (pulled up to 3.3V) → LED off
 * Key closed: Pin 2 = LOW (connected to GND)  → LED on
 */

// Configure Pin 2 on Port A as input with pull-up resistor
const keyPin = tessel.port.A.pin[2];
keyPin.input();
keyPin.pull("pullup");

// Use LED0 (green) for key state indication
const keyLED = tessel.led[2];

// Store SSE clients
const sseClients = [];

console.log(
	"CW Keyer ready. Connect straight key between Pin 2 and GND on Port A.",
);

// Broadcast key state to all SSE clients
function broadcastKeyState(keyDown, timestamp) {
	const data = JSON.stringify({ keyDown, timestamp });
	sseClients.forEach((client) => {
		client.write(`data: ${data}\n\n`);
	});
}

// Monitor pin state and control LED
keyPin.on(
	"change",
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
	},
);

const port = 80;

const server = http
	.createServer((request, response) => {
		// Handle SSE endpoint
		if (request.url === "/events") {
			response.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			});

			// Add client to list
			sseClients.push(response);
			console.log(`SSE client connected. Total clients: ${sseClients.length}`);

			// Send initial connection message
			response.write(
				`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`,
			);

			// Remove client on disconnect
			request.on("close", () => {
				const index = sseClients.indexOf(response);
				if (index !== -1) {
					sseClients.splice(index, 1);
					console.log(
						`SSE client disconnected. Total clients: ${sseClients.length}`,
					);
				}
			});

			return;
		}

		// Serve static files
		let filePath = request.url === "/" ? "/index.html" : request.url;
		filePath = path.join(__dirname, "public", filePath);

		const extname = path.extname(filePath);
		const contentType =
			{
				".html": "text/html",
				".js": "application/javascript",
				".css": "text/css",
			}[extname] || "text/plain";

		fs.readFile(filePath, (err, content) => {
			if (err) {
				response.writeHead(404);
				response.end("Not Found");
			} else {
				response.writeHead(200, { "Content-Type": contentType });
				response.end(content);
			}
		});
	})
	.listen(port, () => console.log(`http://${os.hostname()}.local:${port}`));

process.on("SIGINT", (_) => server.close());
