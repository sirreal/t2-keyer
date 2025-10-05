'use strict';

// Import the interface to Tessel hardware
const tessel = require('tessel');

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
keyPin.pull('pullup');

// Use LED0 (green) for key state indication
const keyLED = tessel.led[2];

console.log('CW Keyer ready. Connect straight key between Pin 2 and GND on Port A.');

// Monitor pin state and control LED
keyPin.on('change', (value) => {
	// Pin reads LOW (0) when key is closed, HIGH (1) when open
	if (value === 0) {
		keyLED.on();
	} else {
		keyLED.off();
	}
});
