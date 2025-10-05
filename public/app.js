// Audio context and nodes
let audioContext;
let oscillator; // Always-on tone for morse key input
let inputGainNode; // Controls input tone volume
let outputOscillator; // Output tone (what you hear)
let outputGainNode; // Controls output tone
let analyser;
let microphone;
let isRunning = false;
let detectionMode = "manual"; // "manual" or "auto"
let detectionThreshold = 5;
let isKeyDown = false;

// UI elements
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const keyBtn = document.getElementById("key");
const frequencySlider = document.getElementById("frequency");
const freqValue = document.getElementById("freqValue");
const statusDiv = document.getElementById("status");
const levelBar = document.getElementById("levelBar");
const levelValue = document.getElementById("levelValue");
const thresholdSlider = document.getElementById("threshold");
const thresholdValue = document.getElementById("thresholdValue");
const keyStateDisplay = document.getElementById("keyState");
const manualControls = document.getElementById("manualControls");
const autoControls = document.getElementById("autoControls");
const modeRadios = document.querySelectorAll('input[name="mode"]');

// Create stereo panner to route tone to left channel
let stereoPanner;

// Initialize audio system
async function initAudio() {
	try {
		console.log('Initializing audio...');
		// Create audio context
		audioContext = new AudioContext();
		console.log('AudioContext created:', audioContext.state);

		// Create INPUT tone - always on, sent to morse key
		oscillator = audioContext.createOscillator();
		inputGainNode = audioContext.createGain();
		const inputPanner = audioContext.createStereoPanner();

		oscillator.frequency.value = parseInt(frequencySlider.value);
		oscillator.connect(inputGainNode);
		inputGainNode.connect(inputPanner);
		inputPanner.connect(audioContext.destination);

		// Pan to left channel - this goes to your morse key
		inputPanner.pan.value = -1;
		inputGainNode.gain.value = 0.3; // Always on
		oscillator.start();
		console.log('Input oscillator started - always on for morse key');

		// Create OUTPUT tone - controlled by key detection
		outputOscillator = audioContext.createOscillator();
		outputGainNode = audioContext.createGain();
		const outputPanner = audioContext.createStereoPanner();

		outputOscillator.frequency.value = parseInt(frequencySlider.value);
		outputOscillator.connect(outputGainNode);
		outputGainNode.connect(outputPanner);
		outputPanner.connect(audioContext.destination);

		// Pan to right channel - this is what you hear
		outputPanner.pan.value = 1;
		outputGainNode.gain.value = 0; // Start muted
		outputOscillator.start();
		console.log('Output oscillator started - muted, will play when key detected');

		// Request microphone access
		console.log('Requesting microphone access...');
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 2,
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false,
			},
		});
		console.log('Microphone stream obtained:', stream.getAudioTracks());

		// Create input chain for monitoring
		microphone = audioContext.createMediaStreamSource(stream);
		analyser = audioContext.createAnalyser();
		analyser.fftSize = 2048;

		// Create channel splitter to read from right channel
		// (tone goes out left channel to key, comes back on right channel from key)
		const splitter = audioContext.createChannelSplitter(2);
		microphone.connect(splitter);

		// Connect right channel (index 1) to analyser - this is where key output returns
		splitter.connect(analyser, 1);
		console.log('Audio routing complete - tone out on left, monitoring right for key return');

		// Start monitoring
		monitorInput();

		isRunning = true;
		statusDiv.textContent = "Status: Running";
		startBtn.disabled = true;
		stopBtn.disabled = false;
		keyBtn.disabled = false;
	} catch (error) {
		console.error("Audio initialization failed:", error);
		alert("Failed to initialize audio: " + error.message);
	}
}

// Stop audio system
function stopAudio() {
	if (audioContext) {
		audioContext.close();
		audioContext = null;
	}
	isRunning = false;
	statusDiv.textContent = "Status: Stopped";
	startBtn.disabled = false;
	stopBtn.disabled = true;
	keyBtn.disabled = true;
	levelBar.style.width = "0%";
	levelValue.textContent = "0";
}

// Monitor input level
function monitorInput() {
	if (!isRunning || !analyser) return;

	const dataArray = new Uint8Array(analyser.frequencyBinCount);
	analyser.getByteTimeDomainData(dataArray);

	// Calculate RMS level
	let sum = 0;
	let max = 0;
	let min = 255;
	for (let i = 0; i < dataArray.length; i++) {
		const val = dataArray[i];
		max = Math.max(max, val);
		min = Math.min(min, val);
		const normalized = (val - 128) / 128;
		sum += normalized * normalized;
	}
	const rms = Math.sqrt(sum / dataArray.length);
	const level = Math.floor(rms * 100);
	const peak = Math.max(Math.abs(max - 128), Math.abs(min - 128));

	levelBar.style.width = level + "%";
	levelValue.textContent = `${level} (peak: ${peak}, range: ${min}-${max})`;

	// Auto detection mode - trigger tone based on input level
	if (detectionMode === "auto") {
		if (level > detectionThreshold && !isKeyDown) {
			// Key just went down
			isKeyDown = true;
			keyDown();
			keyStateDisplay.textContent = "DOWN";
			keyStateDisplay.style.color = "green";
		} else if (level <= detectionThreshold && isKeyDown) {
			// Key just went up
			isKeyDown = false;
			keyUp();
			keyStateDisplay.textContent = "UP";
			keyStateDisplay.style.color = "black";
		}
	}

	requestAnimationFrame(monitorInput);
}

// Key down - generate output tone
function keyDown() {
	if (isRunning && outputGainNode) {
		console.log('Key down - generating output tone');
		outputGainNode.gain.value = 0.3;
	}
}

// Key up - stop output tone
function keyUp() {
	if (isRunning && outputGainNode) {
		outputGainNode.gain.value = 0;
	}
}

// Event listeners
startBtn.addEventListener("click", initAudio);
stopBtn.addEventListener("click", stopAudio);

keyBtn.addEventListener("mousedown", keyDown);
keyBtn.addEventListener("mouseup", keyUp);
keyBtn.addEventListener("mouseleave", keyUp);

// Touch support for mobile
keyBtn.addEventListener("touchstart", (e) => {
	e.preventDefault();
	keyDown();
});
keyBtn.addEventListener("touchend", (e) => {
	e.preventDefault();
	keyUp();
});

// Frequency control
frequencySlider.addEventListener("input", (e) => {
	const freq = parseInt(e.target.value);
	freqValue.textContent = freq;
	if (oscillator) {
		oscillator.frequency.value = freq;
	}
	if (outputOscillator) {
		outputOscillator.frequency.value = freq;
	}
});

// Keyboard support (spacebar)
document.addEventListener("keydown", (e) => {
	if (e.code === "Space" && !e.repeat && isRunning) {
		e.preventDefault();
		keyDown();
	}
});

document.addEventListener("keyup", (e) => {
	if (e.code === "Space" && isRunning) {
		e.preventDefault();
		keyUp();
	}
});

// Mode switching
modeRadios.forEach((radio) => {
	radio.addEventListener("change", (e) => {
		detectionMode = e.target.value;
		if (detectionMode === "manual") {
			manualControls.style.display = "block";
			autoControls.style.display = "none";
			// Reset auto state
			isKeyDown = false;
			if (isRunning) keyUp();
		} else {
			manualControls.style.display = "none";
			autoControls.style.display = "block";
		}
	});
});

// Threshold control
thresholdSlider.addEventListener("input", (e) => {
	detectionThreshold = parseInt(e.target.value);
	thresholdValue.textContent = detectionThreshold;
});

// Initial state
stopBtn.disabled = true;
keyBtn.disabled = true;
