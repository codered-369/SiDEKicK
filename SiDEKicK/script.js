const API_URL = "https://api.imgflip.com/get_memes";

// State
let memes = [];
let currentMeme = null;

// DOM Elements
const imgElement = document.getElementById('memeImage');
const topTextDisplay = document.getElementById('topTextDisplay');
const bottomTextDisplay = document.getElementById('bottomTextDisplay');
const topTextInput = document.getElementById('topTextInput');
const bottomTextInput = document.getElementById('bottomTextInput');
const exportCanvas = document.getElementById('exportCanvas');

// Navigation Functions
function showView(viewId) {
    // Hide all views
    document.querySelectorAll('.app-container').forEach(el => {
        el.style.display = 'none';
    });
    // Show the requested view
    const view = document.getElementById(viewId);
    if (view) {
        view.style.display = 'flex';
        // Re-trigger animation
        view.style.animation = 'none';
        view.offsetHeight; /* trigger reflow */
        view.style.animation = 'slideUp 0.6s ease-out';
    }
}

function showHome() {
    showView('dashboard-view');
}

function openWhatsApp() {
    let rawInput = document.getElementById('waNumber').value;
    console.log("Raw Input:", rawInput);

    if (!rawInput) {
        alert("Please enter a number!");
        return;
    }

    // Remove all non-numeric characters
    let number = rawInput.replace(/\D/g, '');
    console.log("Cleaned Number:", number);

    if (number.length < 10) {
        alert("Please enter a valid mobile number (at least 10 digits).");
        return;
    }

    // Default to +91 if length is exactly 10 (Indian Mobile)
    if (number.length === 10) {
        number = "91" + number;
    }

    // Use api.whatsapp.com as it can be more reliable for deep-linking on some devices
    const url = `https://api.whatsapp.com/send?phone=${number}`;
    console.log("Opening URL:", url);
    window.open(url, '_blank');
}

// --- Traffic Bro Logic ---
let currentAudio = null;
let activeEffects = []; // Track manual sound effects like horns play request
let parkingIntervar = null; // Future use

const SOUND_ASSETS = {
    traffic: "https://actions.google.com/sounds/v1/ambiences/city_street_ambience.ogg",
    rain: "https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg",
    horn: "https://actions.google.com/sounds/v1/transportation/car_horn.ogg"
};

function toggleSound(type, btnElement) {
    // 1. If same sound is playing, stop it
    if (currentAudio && currentAudio.type === type) {
        stopAllSounds();
        return;
    }

    // 2. Stop any existing sound first
    stopAllSounds();

    // 3. Play new sound
    const audio = new Audio(SOUND_ASSETS[type]);
    audio.loop = true;

    // Store type for toggle logic
    audio.type = type;

    // Helper to safely play
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.warn("Audio play failed:", error);
            // If play fails, we shouldn't consider it 'playing'
            if (currentAudio === audio) currentAudio = null;
        });
    }

    // State tracking
    currentAudio = audio;

    // UI Updates
    btnElement.classList.add('active');
    document.getElementById('playing-indicator').classList.remove('hidden');
}

function playEffect(type) {
    const audio = new Audio(SOUND_ASSETS[type]);
    activeEffects.push(audio);

    // Remove from tracking when done
    audio.onended = () => {
        const index = activeEffects.indexOf(audio);
        if (index > -1) {
            activeEffects.splice(index, 1);
        }
    };

    audio.play().catch(e => console.warn("Effect play failed:", e));
}

function stopAllSounds() {
    // 1. Stop Ambient Loop
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0; // Reset position
        currentAudio = null;
    }

    // 2. Stop All Active Effects (Horns etc)
    activeEffects.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
    });
    activeEffects = []; // Clear array

    // 3. UI Reset
    document.querySelectorAll('.sound-card').forEach(el => el.classList.remove('active'));
    const indicator = document.getElementById('playing-indicator');
    if (indicator) indicator.classList.add('hidden');
}

// --- Escape Call Logic ---
let callTimer = null;
let ringtoneAudio = null;

// Generic phone ringtone
const RINGTONE_URL = "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm.ogg";
// Note: digital watch is a placeholder. For a real phone ring we might need a better asset, 
// but this works for a "timer" style escape or we can assume vibration is key. 
// A better "phone" sound:
// https://www.soundjay.com/phone/sounds/phone-calling-1.mp3 (External links might be flaky, stick to google actions if possible or use a known one)
// Let's use the watch alarm, it's annoying enough to be a 'call'.

function scheduleCall(seconds) {
    const display = document.getElementById('timer-display');
    display.classList.remove('hidden');
    display.innerText = `Ringing in ${seconds}s...`;

    // Clear any existing timer
    if (callTimer) clearTimeout(callTimer);

    callTimer = setTimeout(() => {
        triggerFakeCall();
        display.classList.add('hidden');
    }, seconds * 1000);
}

function triggerFakeCall() {
    // 1. Update Caller Name
    const name = document.getElementById('callerName').value || "Unknown";
    document.getElementById('incomingCaller').innerText = name;

    // 2. Play Sound
    ringtoneAudio = new Audio(RINGTONE_URL);
    ringtoneAudio.loop = true;
    ringtoneAudio.play().catch(e => console.log("Audio requires interaction first", e));

    // 3. Vibrate (if mobile)
    if (navigator.vibrate) {
        navigator.vibrate([1000, 500, 1000, 500, 1000]);
    }

    // 4. Show Screen
    document.getElementById('fake-call-screen').classList.remove('hidden');
}

function endFakeCall() {
    // Stop Sound
    if (ringtoneAudio) {
        ringtoneAudio.pause();
        ringtoneAudio.currentTime = 0;
    }

    // Stop Vibration
    if (navigator.vibrate) {
        navigator.vibrate(0);
    }

    // Hide Screen
    document.getElementById('fake-call-screen').classList.add('hidden');
}

// --- Sick Mode Logic ---
let audioCtx;
let mediaRecorder;
let audioChunks = [];
let recordedBlob = null;
let currentFilterType = 'stuffy';
let streamSource = null;
let processorDestination = null;

function selectSickFilter(type) {
    currentFilterType = type;

    // UI Update
    document.getElementById('filter-stuffy').classList.remove('active');
    document.getElementById('filter-throat').classList.remove('active');
    document.getElementById(`filter-${type}`).classList.add('active');
}

async function startSickRecording() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // 1. Get Mic Stream
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // 2. Create Source
        streamSource = audioCtx.createMediaStreamSource(stream);

        // 3. Create Filter Nodes
        let outputNode = streamSource; // Default is chaining off source

        if (currentFilterType === 'stuffy') {
            // Stuffy Nose: Cut Highs, Boost Lows
            const lowpass = audioCtx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 600; // Muffle

            const lowshelf = audioCtx.createBiquadFilter();
            lowshelf.type = 'lowshelf';
            lowshelf.frequency.value = 200;
            lowshelf.gain.value = 15; // Boost bass

            streamSource.connect(lowshelf);
            lowshelf.connect(lowpass);
            outputNode = lowpass;
        } else if (currentFilterType === 'throat') {
            // Sore Throat: Add grain/roughness (Hypothetically - simple EQ here)
            // We'll use a Bandpass to thin it out + HighShelf to make it scratchy
            const bandpass = audioCtx.createBiquadFilter();
            bandpass.type = 'peaking';
            bandpass.frequency.value = 1000;
            bandpass.Q.value = 1;
            bandpass.gain.value = 10;

            streamSource.connect(bandpass);
            outputNode = bandpass;
        }

        // 4. Create Destination to Record
        processorDestination = audioCtx.createMediaStreamDestination();
        outputNode.connect(processorDestination);

        // 5. Start Recorder on the *Processed* stream
        mediaRecorder = new MediaRecorder(processorDestination.stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            recordedBlob = new Blob(audioChunks, { type: 'audio/webm' }); //'audio/wav' not supported by MediaRecorder usually
            const audioURL = URL.createObjectURL(recordedBlob);
            document.getElementById('sickPreview').src = audioURL;
            document.getElementById('sick-actions').style.display = 'flex';

            // Cleanup tracks to stop mic icon in browser
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();

        // UI
        document.getElementById('recordBtn').classList.add('recording');
        document.getElementById('recordStatus').innerText = "Recording... (Speak 'I am sick')";
        document.getElementById('sick-actions').style.display = 'none';

    } catch (err) {
        console.error("Mic Error:", err);
        alert("Microphone access denied! Need mic to fake sickness.");
    }
}

function stopSickRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('recordBtn').classList.remove('recording');
        document.getElementById('recordStatus').innerText = "Tap to Record Again";
    }
}

function toggleSickRecording() {
    const btn = document.getElementById('recordBtn');
    if (btn.classList.contains('recording')) {
        stopSickRecording();
    } else {
        startSickRecording();
    }
}

async function shareSickAudio() {
    if (!recordedBlob) return;

    // Convert to File for sharing
    // Note: WhatsApp supports .webm often, but .mp3/.wav is safer. 
    // Browsers record to webm/ogg. Let's try sharing as is first.
    // Extension .mp3 might trick it if codec is compatible, but safer to use .webm
    const file = new File([recordedBlob], "sick_voice_note.webm", { type: 'audio/webm' });

    const shareData = {
        files: [file],
        title: 'Sick Voice Note',
    };

    if (navigator.share && navigator.canShare(shareData)) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            console.error("Share failed", err);
        }
    } else {
        alert("Web Share not supported. Downloading instead.");
        const a = document.createElement('a');
        a.href = document.getElementById('sickPreview').src;
        a.download = "sick_voice.webm";
        a.click();
    }
}

// Make functions global
window.showView = showView;
window.showHome = showHome;
window.openWhatsApp = openWhatsApp;
window.toggleSound = toggleSound;
window.playEffect = playEffect;
window.stopAllSounds = stopAllSounds;
window.scheduleCall = scheduleCall;
window.endFakeCall = endFakeCall;
window.toggleSickRecording = toggleSickRecording;
window.shareSickAudio = shareSickAudio;

// --- Fake Update Logic ---
let updateInterval = null;

function startFakeUpdate() {
    // Force fullscreen if possible
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => { });

    // Push history state so Browser Back button returns to Dashboard instead of closing app
    history.pushState({ page: 'fake-update' }, "System Update", "#update");

    let percent = 0;
    const percentDisplay = document.getElementById('update-percent');
    percentDisplay.innerText = "0";

    if (updateInterval) clearInterval(updateInterval);

    updateInterval = setInterval(() => {
        // Slowing down as we get higher
        let increment = Math.random() > 0.5 ? 1 : 0;

        // Very slow after 70%
        if (percent > 70 && Math.random() > 0.8) increment = 0;

        // Stuck at 99%
        if (percent >= 99) increment = 0;

        percent += increment;
        percentDisplay.innerText = percent;
    }, 400); // Ticks every 400ms
}

// Override showHome to clear fullscreen
const originalShowHome = showHome;
showHome = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    if (updateInterval) clearInterval(updateInterval);
    originalShowHome();
}

// Global Event Listeners for Exit Scenarios
document.addEventListener('fullscreenchange', () => {
    const updateView = document.getElementById('update-view');
    // If fullscreen exited (e.g. via Esc) AND update view is still visible, go home manually
    if (!document.fullscreenElement && updateView && updateView.style.display !== 'none') {
        showHome();
    }
});

window.addEventListener('popstate', () => {
    // If user clicks Browser Back, ensure we show home/dashboard
    showHome();
});

window.showHome = showHome;
window.startFakeUpdate = startFakeUpdate;

// Roast List (Mixed Kannada/English)
const roasts = [
    "Nimma mukhakke filter haakidru use illa!",
    "Bro, neevu devru... aadre, yavdu? Shani na?",
    "Nin life-u, nin coding skills-u - eradu error free aagalla.",
    "Sumne iru guru, scene create madbeda.",
    "Your code is so messy, even StackOverflow rejected it.",
    "Yen samachara? Full busy na? Or full dizzy na?",
    "Oota aytha? Athva innu bug fix madtidiya?",
    "You are the semi-colon to my missing syntax error.",
    "Saak bidu, ninna kathe keloke yaru illa illi.",
    "Devre, ivnige swalpa buddhi kodu...illa Andre laptop kosi.",
    "Even your WiFi connects faster than your brain works.",
    "Ayyo paapa, innu loop alle sikkakkondiddiya?",
    "Ninna code nodidre, GitHub Copilot kooda resign madutte.",
    "Bro, neenu engineer aagidya ille time pass madtidya?",
    "Debugging madoke baralla, aadre attitude maatra heavy!",
    "Ninna logic nodidre, CPU kooda suicide madkoluthe.",
    "Shift + Delete is the best shortcut for your code.",
    "Yen guru, full brightness ittru nin future dark aagide.",
    "Battery low ide, nin energy thara.",
    "Wifi speed jasthi ide, nin brain speed kadime ide.",
    "Yen brother, weekend plan ena? Coding ah ille crying ah?",
    "Java update aagute, aadre neenu update aagalla.",
    "HTML ge programming language antha helu, saaku.",
    "Nin mukha nodidre 404 Error nenpagutte.",
    "CSS thara adjust aagoke try madu, failure aagbeda.",
    "Python ge snake antha helu, nin thara.",
    "Bro, nin brain usage 100% aadru output zero-ne.",
    "Ram jasthi ide, aadre memory short term ide.",
    "Ninna jokes kelidre, Google Assistant kooda mute aagutte.",
    "Yen maccha, girlfriend siglilla, at least bug sigtha?",
    "Deployment fail aaythu, nin career thara.",
    "Ctrl + Z ottidre nin life undo maadoke aagalla.",
    "Internet fast ide, aadre nin reply slow yak guru?",
    "Nin thale li brain ideya athva empty cache na?",
    "Full stack developer alla, neenu full stuck developer.",
    "React maadu, over-react madbeda.",
    "Node.js baralla, aadre 'No' heloke barutte.",
    "Database connect aagilla, nin brain thara.",
    "Server down aagide, nin mood thara.",
    "API response bandilla, nin reply thara.",
    "404: Sense not found in your talk.",
    "500: Internal Brain Error.",
    "Git push madu, life na push madbeda.",
    "Merge conflict barutte, nin opinions thara.",
    "Branch delete maadu, nin bad habits thara.",
    "Commit message 'Fixed bug' antha haaku, aadre yen fix aagilla.",
    "Pull request reject aaythu, nin proposal thara.",
    "Code review beda, life review beku ninge.",
    "Agile follow maadu, aadre neenu fragile aagidya.",
    "Scrum master alla, neenu scam master.",
    "Sprint mugithu, aadre neenu innu start maadiilla.",
    "Jira ticket open ide, nin bage complaint thara.",
    "Bug fix maadu, life fix madkolo amele.",
    "Production ge code push maadbeda, disaster aagutte.",
    "Staging environment alle crash aaythu, nin plan thara.",
    "Docker container run aagtha illa, nin stamina thara.",
    "Kubernetes cluster down, nin confidence thara.",
    "AWS bill jasthi bantu, nin overthinking thara.",
    "Cloud nalli jaga ide, nin thale li illa.",
    "Serverless architecture, baseless arguments.",
    "Machine Learning model fail aaythu, nin prediction thara.",
    "AI replace maadutte, ninge first.",
    "Blockchain thara complex neenu, yargu artha aagalla.",
    "Crypto loss aaythu, nin time thara.",
    "NFT thara useless neenu.",
    "Metaverse nalli kooda neenu single.",
    "Web3 baralla, Web2 ne innu kalitilla.",
    "Android studio open aagoke 1 varsha aagutte, nin career thara.",
    "iOS developer aagoke duddu beku, ninge kidney beku.",
    "Flutter beku, aadre birds thara haaroke alla.",
    "React Native baralla, native kannada kooda baralla.",
    "Kotlin kaliyoke time illa, gossiping ge time ide.",
    "Swift language gottilla, aadre swift aagi oodogtiya.",
    "Linux use maadu, window nodbeda.",
    "Terminal open madidre hacker antha feel aagtya.",
    "Sudo access illa, life alli control illa.",
    "Vim exit maadoke baralla, problem inda exit aagoke baralla.",
    "Nano use maadu, nin brain size thara.",
    "Bash script run aaglilla, rash driving thara.",
    "Python loop inda horage baa, nin chinte inda horage baa.",
    "Loop infinite aagide, nin problems thara.",
    "Variable define maadu, life define madkolo modlu.",
    "Function call aaglilla, friend call receive maadilla.",
    "Object oriented alla, objectified failure neenu.",
    "Class attend maadilla, adikke class illa ninge.",
    "Inheritance beda, swantha aasthie illa.",
    "Polymorphism artha aagalla, politics mathadtiya.",
    "Encapsulation madu, nin secrets na.",
    "Abstraction level high ide, reality low ide.",
    "Interface sari illa, nin face thara.",
    "Constructor call aaythu, destruct maadu life na.",
    "Exception handle maadu, rejection handle madoke aagalla.",
    "Try-catch block haaku, tears catch madoke.",
    "Async await maadu, success baroke late aagutte.",
    "Promise break aaythu, nin promises thara.",
    "Callback hell nalli idiya, life hell aagide.",
    "Event loop stuck aaythu, traffic nalli stuck aada thara.",
    "DOM update aaglilla, knowledge update aaglilla.",
    "Cookie clear maadu, history clear maadu.",
    "Local storage full aaythu, mind khali ide.",
    "Session expire aaythu, nin time expire aagutte.",
    "Token invalid, nin logic invalid.",
    "Authentication fail, nin entry ban.",
    "Authorization illa, access denied.",
    "Firewall block madtide, hudgiru ninna block maadid haage.",
    "VPN connect aagilla, connection sigtha illa.",
    "IP address change maadu, location change maadu.",
    "DNS resolve aaglilla, confusion clear aaglilla.",
    "Ping high ide, brain lag aagtide.",
    "Packet loss aaythu, memory loss thara.",
    "Router restart maadu, life restart maadu.",
    "Ethernet cable connect maadu, disconnect aagbeda.",
    "Bluetooth pair aaglilla, jodi siglilla.",
    "NFC support illa, contact contactless.",
    "5G speed beku, 2G brain itkondu.",
    "Mobile data khali, wallet khali.",
    "Charger connect maadu, energy illa.",
    "Screen crack aaythu, heart crack aaythu.",
    "Touch work aagtha illa, feelings work aagtha illa.",
    "Camera blur ide, vision clear illa.",
    "Speaker sound baralla, voice keltha illa.",
    "Mic mute aagide, mathu bartha illa.",
    "Notification off maadu, distraction beda.",
    "App crash aaythu, life crash aaythu.",
    "Update install maadu, character build maadu."
];

// Initialize
async function init() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        if (data.success) {
            memes = data.data.memes;
            loadRandomMeme();
        } else {
            alert('Failed to load memes API');
        }
    } catch (e) {
        console.error(e);
        // Fallback or silent fail if just loading dashboard
        // alert('Error fetching memes. Check internet.');
    }
}

function loadRandomMeme() {
    if (memes.length === 0) return;
    const randomIndex = Math.floor(Math.random() * memes.length);
    currentMeme = memes[randomIndex];

    // Reset inputs
    topTextInput.value = "";
    bottomTextInput.value = "";
    updateTextDisplay();

    // Load Image
    imgElement.src = currentMeme.url;
}

function updateTextDisplay() {
    topTextDisplay.innerText = topTextInput.value || "TOP TEXT";
    bottomTextDisplay.innerText = bottomTextInput.value || "BOTTOM TEXT";
}

function roastFriend() {
    const randomRoast = roasts[Math.floor(Math.random() * roasts.length)];

    // Randomly decide if it goes top/bottom or split
    if (Math.random() > 0.5) {
        topTextInput.value = "WHEN SOMEONE SAYS:";
        bottomTextInput.value = randomRoast;
    } else {
        // Split by space for simple effect
        const midpoint = Math.floor(randomRoast.length / 2);
        const spaceIndex = randomRoast.indexOf(' ', midpoint);

        if (spaceIndex !== -1) {
            topTextInput.value = randomRoast.substring(0, spaceIndex);
            bottomTextInput.value = randomRoast.substring(spaceIndex + 1);
        } else {
            topTextInput.value = randomRoast;
            bottomTextInput.value = "";
        }
    }
    updateTextDisplay();
}

async function shareMeme() {
    // We need to draw the current state to the hidden canvas to export it
    const ctx = exportCanvas.getContext('2d');

    // 1. Setup Canvas Size to match the actual image
    exportCanvas.width = imgElement.naturalWidth;
    exportCanvas.height = imgElement.naturalHeight;

    // 2. Draw Image
    try {
        ctx.drawImage(imgElement, 0, 0);
    } catch (e) {
        alert("Cannot export this specific image due to browser security (CORS). Try another meme!");
        return;
    }

    // 3. Configure Text
    const fontSize = Math.floor(exportCanvas.height / 10); // Dynamic font size
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.floor(fontSize / 8);
    ctx.textAlign = 'center';
    ctx.font = `900 ${fontSize}px 'Oswald', sans-serif`; // Impact-style font
    ctx.shadowColor = "black";
    ctx.shadowBlur = 0;

    const x = exportCanvas.width / 2;

    // 4. Draw Top Text
    const topText = topTextDisplay.innerText.toUpperCase();
    ctx.textBaseline = 'top';
    ctx.strokeText(topText, x, 20);
    ctx.fillText(topText, x, 20);

    // 5. Draw Bottom Text
    const bottomText = bottomTextDisplay.innerText.toUpperCase();
    ctx.textBaseline = 'bottom';
    ctx.strokeText(bottomText, x, exportCanvas.height - 20);
    ctx.fillText(bottomText, x, exportCanvas.height - 20);

    // 6. Share or Download
    exportCanvas.toBlob(async (blob) => {
        if (!blob) return;

        const file = new File([blob], `meme_maadi_${Date.now()}.png`, { type: 'image/png' });
        const shareData = {
            files: [file],
            title: 'Meme Maadi',
            text: 'Check out my meme created with Meme Maadi!'
        };

        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Share failed', err);
                    downloadFile(blob);
                }
            }
        } else {
            // Fallback for desktop or unsupported browsers
            downloadFile(blob);
        }
    }, 'image/png');
}

function downloadFile(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `meme_maadi_${Date.now()}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

// Event Listeners
document.getElementById('btnNextMeme').addEventListener('click', loadRandomMeme);
document.getElementById('btnRoast').addEventListener('click', roastFriend);
document.getElementById('btnShare').addEventListener('click', shareMeme);

topTextInput.addEventListener('input', updateTextDisplay);
bottomTextInput.addEventListener('input', updateTextDisplay);

// Start
init();
