// Tessel SSE connection
let eventSource = null;
const tesselConnection = document.getElementById('tesselConnection');
const tesselKey = document.getElementById('tesselKey');
const paddleDit = document.getElementById('paddleDit');
const paddleDah = document.getElementById('paddleDah');
const tesselLog = document.getElementById('tesselLog');

// Paddle tone timer
let paddleToneTimer = null;

// Connect to Tessel SSE stream
function connectToTessel() {
	eventSource = new EventSource('/events');

	eventSource.onopen = () => {
		tesselConnection.textContent = 'Connected';
		tesselConnection.style.color = 'green';
		logTessel('Connected to Tessel');
	};

	eventSource.onerror = () => {
		tesselConnection.textContent = 'Error';
		tesselConnection.style.color = 'red';
		logTessel('Connection error');
	};

	eventSource.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);

			if (data.type === 'connected') {
				logTessel('Received connection confirmation');
			} else if (data.type === 'dit' || data.type === 'dah') {
				// Handle paddle events
				const element = data.type.toUpperCase();
				const elementSpan = data.type === 'dit' ? paddleDit : paddleDah;

				// Visual feedback
				elementSpan.style.color = 'green';
				logTessel(`${element} (${data.duration}ms)`);

				// Play tone for specified duration
				if (isRunning) {
					keyDown();

					// Clear any existing timer
					if (paddleToneTimer) {
						clearTimeout(paddleToneTimer);
					}

					// Schedule tone off
					paddleToneTimer = setTimeout(() => {
						keyUp();
						elementSpan.style.color = '#999';
					}, data.duration);
				} else {
					// If audio not running, still show visual feedback
					setTimeout(() => {
						elementSpan.style.color = '#999';
					}, data.duration);
				}
			} else if (data.keyDown !== undefined) {
				tesselKey.textContent = data.keyDown ? 'DOWN' : 'UP';
				tesselKey.style.color = data.keyDown ? 'green' : 'black';
				logTessel(
					`Straight key ${data.keyDown ? 'DOWN' : 'UP'} at ${new Date(data.timestamp).toLocaleTimeString()}`
				);

				// Play tone when Tessel key is pressed
				if (data.keyDown) {
					keyDown();
				} else {
					keyUp();
				}
			}
		} catch (e) {
			console.error('Error parsing SSE data:', e);
		}
	};
}

function logTessel(message) {
	const line = document.createElement('div');
	line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
	tesselLog.appendChild(line);
	tesselLog.scrollTop = tesselLog.scrollHeight;
}

// Connect on page load
connectToTessel();

// Audio context and nodes
let audioContext;
let oscillator;
let gainNode;
let isRunning = false;

// UI elements
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const keyBtn = document.getElementById('key');
const frequencySlider = document.getElementById('frequency');
const freqValue = document.getElementById('freqValue');
const statusDiv = document.getElementById('status');

// Initialize audio system
async function initAudio() {
	try {
		console.log('Initializing audio...');
		audioContext = new AudioContext();
		console.log('AudioContext created:', audioContext.state);

		// Create oscillator and gain control
		oscillator = audioContext.createOscillator();
		gainNode = audioContext.createGain();

		oscillator.frequency.value = parseInt(frequencySlider.value);
		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);

		gainNode.gain.value = 0; // Start muted
		oscillator.start();
		console.log('Oscillator started - muted, will play when key pressed');

		isRunning = true;
		statusDiv.textContent = 'Status: Running';
		startBtn.disabled = true;
		stopBtn.disabled = false;
		keyBtn.disabled = false;
	} catch (error) {
		console.error('Audio initialization failed:', error);
		alert('Failed to initialize audio: ' + error.message);
	}
}

// Stop audio system
function stopAudio() {
	if (audioContext) {
		audioContext.close();
		audioContext = null;
	}
	isRunning = false;
	statusDiv.textContent = 'Status: Stopped';
	startBtn.disabled = false;
	stopBtn.disabled = true;
	keyBtn.disabled = true;
}

// Key down - generate output tone
function keyDown() {
	if (isRunning && gainNode) {
		gainNode.gain.value = 0.3;
	}
}

// Key up - stop output tone
function keyUp() {
	if (isRunning && gainNode) {
		gainNode.gain.value = 0;
	}
}

// Event listeners
startBtn.addEventListener('click', initAudio);
stopBtn.addEventListener('click', stopAudio);

keyBtn.addEventListener('mousedown', keyDown);
keyBtn.addEventListener('mouseup', keyUp);
keyBtn.addEventListener('mouseleave', keyUp);

// Touch support for mobile
keyBtn.addEventListener('touchstart', (e) => {
	e.preventDefault();
	keyDown();
});
keyBtn.addEventListener('touchend', (e) => {
	e.preventDefault();
	keyUp();
});

// Frequency control
frequencySlider.addEventListener('input', (e) => {
	const freq = parseInt(e.target.value);
	freqValue.textContent = freq;
	if (oscillator) {
		oscillator.frequency.value = freq;
	}
});

// Keyboard support (spacebar)
document.addEventListener('keydown', (e) => {
	if (e.code === 'Space' && !e.repeat && isRunning) {
		e.preventDefault();
		keyDown();
	}
});

document.addEventListener('keyup', (e) => {
	if (e.code === 'Space' && isRunning) {
		e.preventDefault();
		keyUp();
	}
});

// Initial state
stopBtn.disabled = true;
keyBtn.disabled = true;
