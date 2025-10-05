# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CW (Morse Code) keyer interface for the Tessel 2 development board. The project reads a straight key input and provides visual feedback via LEDs.

## Hardware Platform

Tessel 2 microcontroller board running JavaScript (Node.js). Hardware API documentation: https://tessel.gitbooks.io/t2-docs/content/API/Hardware_API.html

Key hardware features:
- Module ports A & B with configurable pins (digital I/O, analog, PWM, I2C, SPI, UART)
- 4 LEDs accessible via `tessel.led[0-3]`
- Pins support pull-up/pull-down resistors and interrupt handling

## Development Workflow

Deploy and run code on Tessel 2:
```bash
t2 run index.js
```

The `.npmrc` file configures `global-style = true` to ensure proper dependency bundling for Tessel deployment. The `.tesselinclude` file specifies non-JavaScript assets to include in deployments.

## Architecture

Entry point is `index.js` which uses the `tessel` module to interface with hardware. The typical pattern is:
- Require the tessel module: `const tessel = require('tessel');`
- Configure pins on ports A or B for input/output
- Use LED methods (`.on()`, `.off()`, `.toggle()`) for visual feedback
- Set up event listeners or intervals for hardware interaction

## Web Interface

The project includes an HTTP server (port 80) that serves a web interface for remote monitoring and control:

**Server Architecture (index.js)**:
- HTTP server serves static files from `public/` directory
- SSE (Server-Sent Events) endpoint at `/events` streams real-time key state changes
- Hardware pin change events broadcast to all connected SSE clients via `broadcastKeyState()`
- Client connections tracked in `sseClients` array

**Web Files (public/ directory)**:
- `index.html` - Main interface with Tessel hardware key status and Web Audio controls
- `app.js` - Client-side JavaScript that connects to SSE stream and controls Web Audio API
- EventSource connection auto-establishes on page load to receive key state updates

**Web Audio Integration**:
- Web Audio API generates CW tones controlled by the Tessel hardware key
- Audio system must be started manually (user clicks "Start Audio" button) due to browser autoplay policies
- `keyDown()`/`keyUp()` functions control tone generation, triggered by SSE events from hardware

**Access**: After running `t2 run index.js`, the web interface is available at `http://<hostname>.local:80`
