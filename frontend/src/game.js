const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

// UI Elements
let uiMenu = document.getElementById('main-menu');
let uiHud = document.getElementById('hud');
let uiShop = document.getElementById('shop');
let uiSummary = document.getElementById('round-summary');
let disasterAlert = document.getElementById('disaster-alert');
let healthBarsContainer = document.getElementById('global-health-bars');

let pCountEl = document.getElementById('player-count');
let pCount = 2;
let bCountEl = document.getElementById('bot-count');
let bCount = 0;

function updatePlayerBotCounts() {
    // If Robots == 0, we need at least 2 players.
    if (bCount === 0) {
        if (pCount < 2) pCount = 2;
    }
    // If total exceeds 8, prioritize keeping the count the user just changed (handled in click handlers)

    pCountEl.innerText = pCount;
    bCountEl.innerText = bCount;
}

let mapPreviewCanvas = document.getElementById('map-preview');
let currentMapType = 'MOUNTAINS';

let tanks = [];
let currentPlayerIndex = 0;
let playersTurned = 0;
document.getElementById('p-down').onclick = () => {
    let minP = (bCount > 0) ? 1 : 2;
    pCount = Math.max(minP, pCount - 1);
    updatePlayerBotCounts();
};
document.getElementById('p-up').onclick = () => {
    if (pCount + bCount < 8) pCount++;
    updatePlayerBotCounts();
};
document.getElementById('b-down').onclick = () => {
    bCount = Math.max(0, bCount - 1);
    updatePlayerBotCounts();
};
document.getElementById('b-up').onclick = () => {
    if (pCount + bCount < 8) bCount++;
    updatePlayerBotCounts();
};
document.getElementById('start-btn').onclick = startGame;

const currentWeaponNameEl = document.getElementById('current-weapon-name');
const currentPlayerNameEl = document.getElementById('current-player-name');

let weaponPopupTimeout;
function showWeaponPopup(weaponName) {
    let popup = document.getElementById('weapon-popup');
    if (!popup) return;
    popup.innerText = weaponName;
    popup.style.opacity = 1;
    clearTimeout(weaponPopupTimeout);
    weaponPopupTimeout = setTimeout(() => {
        popup.style.opacity = 0;
    }, 3000);
}

// Config & Globals
const WEAPON_ICONS = {
    'W1': '💧', 'W2': '🔱', 'W3': '💣',
    'W4': '☢️', 'W5': '💥', 'W6': '⚡',
    'W7': '🧨', 'W8': '🎯', 'W9': '🔥',
    'W10': '⚙️', 'W11': '🎯', 'W12': '🌍',
    'W13': '🎱', 'W14': '☠️', 'W15': '🚀',
    'W16': '☣️', 'W17': '🔴', 'W18': '💠',
    'W19': '🧪', 'W20': '❄️', 'W21': '🗂️',
    'W22': '🚅', 'W23': '🐌', 'W24': '🕳️',
    'W25': '🔩', 'W26': '💩', 'W27': '📣',
    'W28': '🔮', 'W29': '☄️', 'W30': '🌑'
};

// Retro MIDI Sound System (Web Audio API)
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

class SoundEngine {
    constructor() {
        this.ctx = audioCtx;
        // Need to resume on first interaction
        window.addEventListener('click', () => { if (this.ctx.state === 'suspended') this.ctx.resume(); }, { once: true });
        window.addEventListener('keydown', () => { if (this.ctx.state === 'suspended') this.ctx.resume(); }, { once: true });
    }

    playTone(freq, type, duration, vol = 0.5) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type; // 'square', 'sawtooth', 'triangle', 'sine'
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playNoise(duration, vol = 0.5) {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            // White noise
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();

        // Lowpass filter for boomy explosion
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    playUI() { this.playTone(600, 'square', 0.1, 0.1); }
    playShoot() {
        this.playTone(400, 'sawtooth', 0.2, 0.2);
        setTimeout(() => this.playTone(200, 'sawtooth', 0.2, 0.2), 50);
    }
    playExplosion() { this.playNoise(0.5, 0.6); }
    playTurn() {
        this.playTone(300, 'sine', 0.1);
        setTimeout(() => this.playTone(400, 'sine', 0.1), 100);
    }
}

class BGMPlayer {
    constructor() {
        this.tracks = [
            './music/btw01.mp3', './music/btw02.mp3',
            './music/btw03.mp3', './music/btw04.mp3', './music/btw05.mp3', './music/btw06.mp3',
            './music/btw07.mp3', './music/btw08.mp3'
        ];
        this.audio = new Audio();
        this.audio.volume = 0.5;
        this.muted = false;
        this.started = false;

        // Loop continuously through random tracks
        this.audio.addEventListener('ended', () => {
            console.log("Track ended, playing next...");
            this.playRandom();
        });

        const initAudio = () => {
            if (!this.started && !this.muted) {
                this.started = true;
                this.playRandom();
            }
        };

        // Try to start immediately (browser may block this)
        window.addEventListener('load', () => {
            console.log("Window loaded, attempting initial BGM start");
            initAudio();
        });

        // Try to start on ANY user interaction anywhere on the page as fallback
        this.clickListener = initAudio;
        this.keyListener = initAudio;
        this.touchListener = initAudio;
        window.addEventListener('click', this.clickListener);
        window.addEventListener('keydown', this.keyListener);
        window.addEventListener('touchstart', this.touchListener);
    }

    playRandom() {
        if (this.muted) return;
        let randomIndex = Math.floor(Math.random() * this.tracks.length);
        console.log("BGMPlayer: Loading and playing", this.tracks[randomIndex]);
        this.audio.src = this.tracks[randomIndex];

        // Browsers require a promise catch for play()
        let playPromise = this.audio.play();
        if (playPromise !== undefined) {
            playPromise.then(_ => {
                console.log("BGM Playing successfully");
                // Remove listeners now that we are successfully playing
                window.removeEventListener('click', this.clickListener);
                window.removeEventListener('keydown', this.keyListener);
                window.removeEventListener('touchstart', this.touchListener);
            }).catch(error => {
                console.log("Audio autoplay prevented by browser. Waiting for explicit interaction.", error.name);
                this.started = false; // Reset so they can try clicking again
            });
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        this.audio.muted = this.muted;

        let btn = document.getElementById('btn-mute');
        if (btn) btn.innerText = this.muted ? '🔇' : '🔊';

        if (!this.muted) {
            if (this.audio.paused || !this.started) {
                this.started = true;
                this.playRandom();
            }
        } else {
            this.audio.pause();
        }
    }

    nextTrack() {
        if (!this.muted) {
            this.started = true;
            this.playRandom();
        }
    }
}

const sfx = new SoundEngine();
const bgm = new BGMPlayer();

// Config & Globals
let CELL = 4; // Higher resolution for "fine pixels" (Physics still OFF for safety)
let GW = 0, GH = 0;
let gameState = 'MENU'; // MENU, AIMING, FIRING, DISASTER, SHOP, ROUND_OVER
let screenShake = 0;
let physicsSettleFrames = 0;
let globalCollapse = 0;
let genPhase = 'OFF', genPhaseTimer = 0;
let camX = 0; // Camera horizontal offset
let camY = 0; // Camera vertical offset
let targetCamX = 0;
let targetCamY = 0;
let camZoom = 1.0;
let targetCamZoom = 1.0;
let lastFrameTime = performance.now();
let dt = 0;
let camVelX = 0, camVelY = 0, camVelZoom = 0;

// Intro Sequence
let introPhase = 0; // 0: map, 1..N: players
let introTimer = 0;
let lastPointerX = 0;
let lastPointerY = 0;

// Multi-Touch Tracking (v0.8.5)
let activePointers = new Map();
let isPanning = false;
let initialPinchDist = 0;
let initialPinchZoom = 1.0;
let initialMidX = 0;
let initialMidY = 0;
let initialCamX = 0;
let initialCamY = 0;
let turnTimer = 30;
const TURN_TIME_LIMIT = 30;
let turnTimerUI = null;


// Entities
let projectiles = [];
let particles = [];
let physicsParticles = []; // Flying terrain debris
const DEBUG_CONFIG = {
    tornadoRockDepth: 0,
    tornadoDirtDepth: 0,
    tornadoSandDeletPct: 0
};
let physicsFrameCount = 0;
let staticEntities = []; // houses, trees
let genSpawners = [];
let rocks = [];

// Shop
let currentShopPlayer = 0;
let isSellingMode = false;

// Terrain System
const TYPE_AIR = 0, TYPE_SAND = 1, TYPE_ROCK = 2, TYPE_EARTH = 3, TYPE_LAVA = 4, TYPE_WATER = 5, TYPE_TREE = 6, TYPE_WOOD = 7, TYPE_LEAF = 8, TYPE_TOXIC_WATER = 9;
let grid, materialAge;
let gridUpdated = true;
let terrainCanvas, tCtx;

// Active Columns Optimization (Physics 2.0)
let activeCols = new Uint8Array(1920); // 0 = inactive, > 0 = ticks remaining

function markActiveArea(worldX, radius) {
    let cx = Math.floor(worldX / CELL);
    let r = Math.floor((radius + 20) / CELL);
    for (let x = cx - r; x <= cx + r; x++) {
        if (x >= 0 && x < 1920) activeCols[x] = 120; // 2 seconds of physics activity
    }
}

const WEAPONS = [
    { id: 'W1', icon: '💧', name: 'Ink Splat', damage: 30, radius: 40, count: 1, speed: 1.0, spread: 0, cost: 0, destroysRock: true },
    { id: 'W2', icon: '💦', name: 'Triple Nib', damage: 15, radius: 25, count: 3, speed: 1.0, spread: 0.1, cost: 50, destroysRock: true },
    { id: 'W3', icon: '🧹', name: 'Eraser Bomb', damage: 80, radius: 80, count: 1, speed: 0.6, spread: 0, cost: 100, destroysRock: true },
    { id: 'W4', icon: '☢️', name: 'Ink Nuke', damage: 150, radius: 200, count: 1, speed: 0.8, spread: 0, cost: 200, destroysRock: true },
    { id: 'W5', icon: '💥', name: 'Shatter Bomb', damage: 20, radius: 25, count: 1, speed: 0.9, spread: 0, cost: 120, destroysRock: true, special: 'SHATTER' },
    { id: 'W6', icon: '⚡', name: 'EMP Blast', damage: 10, radius: 300, count: 1, speed: 0.7, spread: 0, cost: 150, destroysRock: true, special: 'EMP' },
    { id: 'W7', icon: '💣', name: 'Big Grenade', damage: 100, radius: 100, count: 1, speed: 0.85, spread: 0, cost: 130, destroysRock: true, special: 'BIG_SHATTER' },
    { id: 'W8', icon: '🎯', name: 'Mass Carpet Bomb', damage: 40, radius: 40, count: 10, speed: 1.2, spread: 0.5, cost: 300, destroysRock: true },
    { id: 'W9', icon: '🔥', name: 'Napalm Canister', damage: 20, radius: 30, count: 1, speed: 0.7, spread: 0, cost: 180, destroysRock: true, special: 'NAPALM' },
    { id: 'W10', icon: '🔩', name: 'Heavy Driller', damage: 50, radius: 15, count: 1, speed: 1.5, spread: 0, cost: 160, destroysRock: true, special: 'DRILL' },
    { id: 'W11', icon: '🎯', name: 'Sniper Dart', damage: 90, radius: 10, count: 1, speed: 2.5, spread: 0, cost: 80, destroysRock: true },
    { id: 'W12', icon: '🌋', name: 'Earthquake Missile', damage: 20, radius: 80, count: 1, speed: 1.0, spread: 0, cost: 250, destroysRock: true, special: 'QUAKE' },
    { id: 'W13', icon: '🏀', name: 'Bouncy Ball', damage: 60, radius: 50, count: 1, speed: 0.8, spread: 0, cost: 110, destroysRock: true, special: 'BOUNCE' },
    { id: 'W14', icon: '💀', name: 'DOOMSDAY DEVICE', damage: 500, radius: 250, count: 1, speed: 0.5, spread: 0, cost: 1000, destroysRock: true },
    { id: 'W15', icon: '🚀', name: 'Swarm Missile', damage: 60, radius: 40, count: 1, speed: 0.9, spread: 0, cost: 280, destroysRock: true, special: 'HOMING' },
    { id: 'W16', icon: '🧪', name: 'Toxic Rain', damage: 20, radius: 10, count: 1, speed: 1.0, spread: 0, cost: 140, destroysRock: true, special: 'TOXIC_RAIN' },
    { id: 'W17', icon: '🔴', name: 'Laser Beam', damage: 100, radius: 30, count: 1, speed: 5.0, spread: 0, cost: 300, destroysRock: true, special: 'LASER' },
    { id: 'W18', icon: '💠', name: 'Cluster Mine', damage: 40, radius: 50, count: 1, speed: 0.9, spread: 0, cost: 150, destroysRock: true, special: 'CLUSTER' },
    { id: 'W19', icon: '🧪', name: 'Acid Rain', damage: 10, radius: 5, count: 1, speed: 1.0, spread: 0, cost: 170, destroysRock: true, special: 'ACID_RAIN' },
    { id: 'W20', icon: '❄️', name: 'Ice Shard', damage: 30, radius: 40, count: 1, speed: 1.2, spread: 0, cost: 130, destroysRock: true, special: 'ICE_SHARD' },
    { id: 'W21', icon: '🗂️', name: 'MIRV launcher', damage: 40, radius: 40, count: 1, speed: 0.8, spread: 0, cost: 400, destroysRock: true, special: 'MIRV' },
    { id: 'W22', icon: '🚅', name: 'Railgun', damage: 120, radius: 15, count: 1, speed: 8.0, spread: 0, cost: 350, destroysRock: true, special: 'RAILGUN' },
    { id: 'W23', icon: '🐌', name: 'Molten Slug', damage: 50, radius: 60, count: 1, speed: 0.7, spread: 0, cost: 220, destroysRock: true, special: 'LAVA_SLUG' },
    { id: 'W24', icon: '🕳️', name: 'Vacuum Bomb', damage: 0, radius: 120, count: 1, speed: 1.0, spread: 0, cost: 200, destroysRock: true, special: 'VACUUM' },
    { id: 'W25', icon: '🔩', name: 'Super Driller', damage: 70, radius: 15, count: 1, speed: 1.6, spread: 0, cost: 210, destroysRock: true, special: 'SUPER_DRILL' },
    { id: 'W26', icon: '💩', name: 'Dirty Bomb', damage: 20, radius: 80, count: 1, speed: 0.8, spread: 0, cost: 180, destroysRock: true, special: 'DIRTY_BOMB' },
    { id: 'W27', icon: '📣', name: 'Sonic Pulse', damage: 30, radius: 100, count: 1, speed: 1.2, spread: 0, cost: 160, destroysRock: true, special: 'SONIC' },
    { id: 'W28', icon: '🔮', name: 'Plasma Ball', damage: 150, radius: 80, count: 1, speed: 0.4, spread: 0, cost: 500, destroysRock: true, special: 'PLASMA' },
    { id: 'W29', icon: '☄️', name: 'Meteorite', damage: 100, radius: 60, count: 1, speed: 1.1, spread: 0, cost: 250, destroysRock: true, special: 'METEORITE' },
    { id: 'W30', icon: '🌑', name: 'Black Hole', damage: 200, radius: 150, count: 1, speed: 0.6, spread: 0, cost: 800, destroysRock: true, special: 'BLACK_HOLE' }
];
const ITEMS = [
    { id: 'I1', name: 'Armor Plate', icon: '🛡', desc: '+50 Shield', cost: 40, apply: t => t.shield += 50 },
    { id: 'I2', name: 'Repair Kit', icon: '🔧', desc: '+100 HP', cost: 40, apply: t => { t.hp = Math.min(200, t.hp + 100); t.shield = Math.max(t.shield, 50); } },
    { id: 'I3', name: 'Jetpack Fuel', icon: '⛽', desc: '+500 Fuel', cost: 80, apply: t => t.fuel += 500 },
    { id: 'I4', name: 'Teleporter', icon: '✨', desc: 'Shoot to warp or Auto-Evade!', cost: 120, damage: 0, radius: 0, count: 1, speed: 2.0, spread: 0, apply: null, special: 'TELEPORT', isItem: false },
    { id: 'I5', name: 'Super Shield', icon: '🛡️', desc: '+150 Shield', cost: 100, apply: t => t.shield += 150 },
    { id: 'I6', name: 'Mega-Repair', icon: '💖', desc: 'Full Heal & Shield!', cost: 150, apply: t => { t.hp = 200; t.shield = Math.max(t.shield, 100); } }
];

function resizeInit() {
    // Lock internal resolution to 1080p (1920x1080)
    canvas.width = 1920;
    canvas.height = 1080;

    ctx.imageSmoothingEnabled = false;

    // World Dimensions (Fixed)
    GW = 1920 / CELL; // 1920 / CELL (4)
    GH = 1080 / CELL;  // 1080 / CELL (4)

    if (GW <= 0 || GH <= 0) { GW = 100; GH = 100; }

    if (!terrainCanvas) {
        terrainCanvas = document.createElement('canvas');
        terrainCanvas.width = GW;
        terrainCanvas.height = GH;
        tCtx = terrainCanvas.getContext('2d');
        tCtx.imageSmoothingEnabled = false;

        grid = new Uint8Array(GW * GH);
        materialAge = new Uint16Array(GW * GH);
    }

    // Always fit map on resize
    fitMapToWindow();
}

function fitMapToWindow() {
    // ALWAYS fit map to window width
    let baseScale = window.innerWidth / 1920;

    // If user is in MENU or intro, force targetCamZoom to 1.0 (full view width)
    if (gameState === 'MENU' || gameState === 'INTRO' || gameState === 'GENERATING') {
        targetCamZoom = 1.0;
        targetCamX = 0;
        let viewH = window.innerHeight / (baseScale * 1.0);
        targetCamY = (1080 - viewH) / 2;

        // Immediate snap for these states
        camZoom = 1.0;
        camX = targetCamX;
        camY = targetCamY;
    }
}

window.addEventListener('resize', resizeInit);
resizeInit();

// Virtual Cursor (Snapping fully removed)
const virtualCursor = document.getElementById('virtual-cursor');
turnTimerUI = document.getElementById('turn-timer-ui');
let isUsingVirtualCursor = true;
let vcX = window.innerWidth / 2;
let vcY = window.innerHeight / 2;


window.addEventListener('mousemove', (e) => {
    // Snapping fully removed
    vcX = e.clientX;
    vcY = e.clientY;
    if (virtualCursor) {
        virtualCursor.style.left = vcX + 'px';
        virtualCursor.style.top = vcY + 'px';
    }

    // Aim via Mouse/Pointer relative to Tank
    if (gameState === 'AIMING') {
        let t = tanks[currentPlayerIndex];
        if (t && t.actionMode === 'AIMING' && !t.isBot) {
            // Calculate scale based on new fit logic
            let baseScale = window.innerWidth / 1920;
            let totalScale = baseScale * camZoom;

            let mx = camX + e.clientX / totalScale;
            let my = camY + e.clientY / totalScale;

            let tankWorldX = t.x;
            let tankWorldY = (t.y - 10); // Approximation height of tank

            // Angle from Tank to Cursor
            let dx = mx - tankWorldX;
            let dy = tankWorldY - my; // Invert Y because canvas Y grows downwards
            t.angle = Math.atan2(dy, dx);

            // Power based on Distance to Cursor (Cap at 100)
            let dist = Math.sqrt(dx * dx + dy * dy);
            t.power = Math.max(0, Math.min(100, dist / 4));
        }
    }
});

let lastCanvasClickTime = 0;

window.addEventListener('wheel', e => {
    e.preventDefault();

    // Use current cursor position as the zoom anchor
    let anchorX = e.clientX;
    let anchorY = e.clientY;

    // Calculate world position of the anchor before zoom
    let baseScale = window.innerWidth / 1920;
    let oldTotalScale = baseScale * camZoom;
    let worldAnchorX = targetCamX + anchorX / oldTotalScale;
    let worldAnchorY = targetCamY + anchorY / oldTotalScale;

    // Apply zoom
    const zoomSpeed = 0.15;
    if (e.deltaY < 0) targetCamZoom *= (1 + zoomSpeed);
    else targetCamZoom /= (1 + zoomSpeed);

    // Calculate Min Zoom: fit 1920x1080 into window
    let minZoom = 1.0;

    // Max Zoom relative to fit
    let maxZoom = 10.0;
    targetCamZoom = Math.max(minZoom, Math.min(maxZoom, targetCamZoom));

    // Calculate NEW world position of the anchor immediately
    let newTotalScale = baseScale * targetCamZoom;

    // Adjust targetCamX and targetCamY so the worldAnchor stays at the same screen coordinates
    targetCamX = worldAnchorX - anchorX / newTotalScale;
    targetCamY = worldAnchorY - anchorY / newTotalScale;

    // Clamp camera within map bounds
    let maxCamX = Math.max(0, 1920 - (window.innerWidth / newTotalScale));
    let maxCamY = Math.max(0, 1080 - (window.innerHeight / newTotalScale));
    targetCamX = Math.max(0, Math.min(maxCamX, targetCamX));
    targetCamY = Math.max(0, Math.min(maxCamY, targetCamY));

}, { passive: false });

window.addEventListener('pointerdown', (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1) {
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;

        // Firing / Moving logic
        if (gameState === 'AIMING') {
            let t = tanks[currentPlayerIndex];
            if (t && !t.isBot) {
                let now = Date.now();
                let isDoubleClick = (now - lastCanvasClickTime) < 300;
                lastCanvasClickTime = now;

                if (t.actionMode === 'AIMING' && isDoubleClick) {
                    sfx.playShoot();
                    fireProjectile();
                }
            }
        }
    } else if (activePointers.size === 2) {
        // Multi-touch Pan/Zoom Init
        let pts = Array.from(activePointers.values());
        let dx = pts[0].x - pts[1].x;
        let dy = pts[0].y - pts[1].y;
        initialPinchDist = Math.sqrt(dx * dx + dy * dy);
        initialPinchZoom = targetCamZoom;
        initialMidX = (pts[0].x + pts[1].x) / 2;
        initialMidY = (pts[0].y + pts[1].y) / 2;
        initialCamX = camX;
        initialCamY = camY;
        isPanning = true;
    }
}, { passive: true });

window.addEventListener('pointermove', e => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    let baseScale = window.innerWidth / 1920;
    const scale = baseScale * camZoom;

    if (activePointers.size === 1) {
        let t = tanks[currentPlayerIndex];

        if (e.pointerType === 'mouse') {
            // MOUSE LOGIC: Middle click or Left click drag
            if (e.buttons === 1 || e.buttons === 4) {
                // Dragging (Panning)
                let dx = e.clientX - lastPointerX;
                let dy = e.clientY - lastPointerY;
                targetCamX -= dx / scale;
                targetCamY -= dy / scale;
                lastPointerX = e.clientX;
                lastPointerY = e.clientY;
                isPanning = true;
            } else if (gameState === 'AIMING' && t && !t.isBot) {
                // Moving without click: Update Aim (Angle only, power based on tank dist)
                let mx = camX + e.clientX / scale;
                let my = camY + e.clientY / scale;
                let dx = mx - t.x;
                let dy = (t.y - 10) - my;
                t.angle = Math.atan2(dy, dx);
                if (t.actionMode === 'MOVING') t.moveTargetX = mx;
                lastPointerX = e.clientX;
                lastPointerY = e.clientY;
                isPanning = false;
            } else {
                isPanning = false;
                lastPointerX = e.clientX;
                lastPointerY = e.clientY;
            }
        } else {
            // TOUCH LOGIC: 1 finger always aims (angle + power)
            if (gameState === 'AIMING' && t && !t.isBot) {
                let mx = camX + e.clientX / scale;
                let my = camY + e.clientY / scale;

                if (t.actionMode === 'AIMING') {
                    let dx = mx - t.x;
                    let dy = (t.y - 10) - my;
                    t.angle = Math.atan2(dy, dx);
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    t.power = Math.max(0, Math.min(100, dist / 4));
                } else if (t.actionMode === 'MOVING') {
                    t.moveTargetX = mx;
                }
            }
            isPanning = false;
        }
    } else if (activePointers.size === 2 && isPanning) {
        // Two fingers: ZOOM and PAN over midpoint
        let pts = Array.from(activePointers.values());
        let dx = pts[0].x - pts[1].x;
        let dy = pts[0].y - pts[1].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let currentMidX = (pts[0].x + pts[1].x) / 2;
        let currentMidY = (pts[0].y + pts[1].y) / 2;

        // Scale pinch zoom
        if (initialPinchDist > 0) {
            let zoomFactor = dist / initialPinchDist;
            let newZoom = initialPinchZoom * zoomFactor;
            targetCamZoom = Math.max(1.0, Math.min(10.0, newZoom));

            // Keep the world point under the initial midpoint at the current midpoint
            let bs = window.innerWidth / 1920;
            let worldX = initialCamX + initialMidX / (bs * initialPinchZoom);
            let worldY = initialCamY + initialMidY / (bs * initialPinchZoom);

            targetCamX = worldX - currentMidX / (bs * targetCamZoom);
            targetCamY = worldY - currentMidY / (bs * targetCamZoom);
        }
    }

    // Clamp targetCamX globally to prevent revealing the side void
    let maxCamX = Math.max(0, 1920 - (window.innerWidth / scale));
    targetCamX = Math.max(0, Math.min(maxCamX, targetCamX));

    // Vertical: Always center player if we are just starting/switching, 
    // but for manual panning, we allow revealing the void to keep logic simple and player-centered.
    // If map is shorter than window height, center it vertically
    let viewH = window.innerHeight / scale;
    if (1080 < viewH) {
        targetCamY = (1080 - viewH) / 2;
    } else {
        // For manual panning, we could clamp Y here if we wanted to prevent vertical void,
        // but per user request ("always place player in middle"), we prioritize centering.
        // To prevent extreme scrolling off-map, let's add a loose vertical clamp
        targetCamY = Math.max(-viewH / 2, Math.min(1080 - viewH / 2, targetCamY));
    }

    vcX = e.clientX;
    vcY = e.clientY;
    if (virtualCursor) {
        virtualCursor.style.left = vcX + 'px';
        virtualCursor.style.top = vcY + 'px';
    }
});

window.addEventListener('pointerup', (e) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) isPanning = false;
});
window.addEventListener('pointercancel', (e) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) isPanning = false;
});

function initMobileControls() {
    const btnOk = document.getElementById('btn-ok');
    if (btnOk) {
        btnOk.onclick = () => {
            let t = tanks[currentPlayerIndex];
            if (t && gameState === 'AIMING' && t.actionMode === 'AIMING') {
                sfx.playShoot();
                fireProjectile();
            }
        };
    }
    const btnMove = document.getElementById('btn-move');
    if (btnMove) {
        btnMove.onclick = () => {
            let t = tanks[currentPlayerIndex];
            if (t && gameState === 'AIMING') {
                t.actionMode = (t.actionMode === 'AIMING' ? 'MOVING' : 'AIMING');
                if (t.actionMode === 'MOVING') t.moveTargetX = null;
                showWeaponPopup(t.actionMode);
                updateHUD();
            }
        };
    }
    const btnWpn = document.getElementById('btn-wpn');
    if (btnWpn) {
        btnWpn.onclick = () => {
            let t = tanks[currentPlayerIndex];
            if (t && gameState === 'AIMING') {
                t.weaponIndex = (t.weaponIndex + 1) % t.inventory.length;
                let w = t.inventory[t.weaponIndex];
                showWeaponPopup(w.name);
                updateHUD();
            }
        };
    }
    const btnItems = document.getElementById('btn-items');
    if (btnItems) {
        btnItems.onclick = () => {
            if (gameState === 'AIMING') {
                // Toggle between SHOP (Items) and AIMING if possible? 
                // Or just show weapon popup with items?
                // For now, let's make it trigger the "b" (bag) weapon change logic
                let t = tanks[currentPlayerIndex];
                t.weaponIndex = (t.weaponIndex + 1) % t.inventory.length;
                showWeaponPopup(t.inventory[t.weaponIndex].name);
                updateHUD();
            }
        };
    }
}
initMobileControls();

// Touch controls handled via Pointer Events in v0.8.5



function clickVirtualCursor() {
    let btn = snapVirtualCursor(vcX, vcY);
    if (btn) {
        btn.click();
        if (window.sfx) sfx.playUI();
    }
}

// Hide virtual cursor entirely on touch devices to avoid ghost crosshairs
window.addEventListener('touchstart', () => {
    isUsingVirtualCursor = false;
    if (virtualCursor) virtualCursor.style.display = 'none';
}, { passive: true });

// Input
let keys = {};

const keyToButtonMap = {
    '4': 'btn-left', 'arrowleft': 'btn-left',
    '6': 'btn-right', 'arrowright': 'btn-right',
    '2': 'btn-up', 'arrowup': 'btn-up',
    '8': 'btn-down', 'arrowdown': 'btn-down',
    '5': 'btn-ok', 'enter': 'btn-ok', 'numpadenter': 'btn-ok', 'space': 'btn-ok',
    '1': 'btn-wpn', 'b': 'btn-wpn',
    '3': 'btn-move', 'm': 'btn-move',
    '7': 'btn-mute',
    '9': 'btn-next',
    'f': 'btn-fullscreen'
};

function visualizeKeyPress(key) {
    if (gameState !== 'AIMING' && gameState !== 'MOVING') return;
    const btnId = keyToButtonMap[key.toLowerCase()];
    if (!btnId) return;

    const btn = document.getElementById(btnId);
    if (btn && btn.offsetParent !== null) {
        btn.classList.add('active');
    }
}

function removeVisualizeKeyPress(key) {
    const btnId = keyToButtonMap[key.toLowerCase()];
    if (!btnId) return;
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.remove('active');
}

window.addEventListener('keydown', e => {
    if (e.repeat) return;

    // Virtual Cursor D-Pad Menu Navigation


    keys[e.key.toLowerCase()] = true;
    keys[e.key] = true;

    // Add visual feedback to on-screen buttons
    visualizeKeyPress(e.code);
    visualizeKeyPress(e.key);

    // TV Remote D-Pad / Numpad Mappings
    if (e.key === '4') keys['arrowleft'] = true;
    if (e.key === '6') keys['arrowright'] = true;
    if (e.key === '2') keys['arrowup'] = true;
    if (e.key === '8') keys['arrowdown'] = true;

    // Map TV Remote 'OK', Keyboard 'Enter', 'NumpadEnter', or '5' to Space
    if (e.code === 'Space' || e.key === 'Enter' || e.code === 'NumpadEnter' || e.key === '5') {
        keys['space'] = true;
    }

    // Audio Controls
    if (e.key === '7') bgm.toggleMute();
    if (e.key === '9') bgm.nextTrack();

    if (gameState === 'AIMING') {
        let t = tanks[currentPlayerIndex];

        // Map TV Remote 'Back', standard 'Escape', or Numpad '3' to toggle Aim/Move
        if (e.key.toLowerCase() === 'm' || e.key === 'Backspace' || e.key === 'Escape' || e.key === '3') {
            t.actionMode = t.actionMode === 'AIMING' ? 'MOVING' : 'AIMING';
            sfx.playUI();
            updateHUD();
        }
        // Map 'b' or Numpad '1' to change weapon
        if (e.key.toLowerCase() === 'b' || e.key === '1') {
            let start = t.weaponIndex;
            do {
                t.weaponIndex = (t.weaponIndex + 1) % t.inventory.length;
            } while (t.weaponIndex !== start && t.inventory.findIndex(i => i.id === t.inventory[t.weaponIndex].id) !== t.weaponIndex);
            sfx.playUI();
            updateHUD();
            showWeaponPopup(t.inventory[t.weaponIndex].name);
        }
    } else if (gameState === 'MENU' || gameState === 'SHOP' || gameState === 'ROUND_OVER') {
        const overlay = document.querySelector('.overlay:not(.hidden)');
        if (!overlay) return;

        const isShop = gameState === 'SHOP';
        const isMenu = gameState === 'MENU';

        const shopGrid = overlay.querySelector('.shop-grid');
        const shopItems = shopGrid ? Array.from(shopGrid.querySelectorAll('.shop-item')) : [];
        const otherBtns = Array.from(overlay.querySelectorAll('button:not(.shop-grid button)'));
        const allFocusable = shopItems.concat(otherBtns);
        const currentIndex = allFocusable.indexOf(document.activeElement);

        let nextTarget = null;
        let handled = false;

        if (isShop && shopGrid) {
            const itemIndex = shopItems.indexOf(document.activeElement);
            if (itemIndex !== -1) {
                const col = itemIndex % 3;
                const row = Math.floor(itemIndex / 3);
                const rowCount = Math.ceil(shopItems.length / 3);

                if (e.key === 'ArrowRight') {
                    if (col < 2 && itemIndex + 1 < shopItems.length) nextTarget = shopItems[itemIndex + 1];
                    handled = true; // Wall on far right
                } else if (e.key === 'ArrowLeft') {
                    if (col > 0) nextTarget = shopItems[itemIndex - 1];
                    handled = true; // Wall on far left
                } else if (e.key === 'ArrowDown') {
                    if (row < rowCount - 1 && itemIndex + 3 < shopItems.length) {
                        nextTarget = shopItems[itemIndex + 3];
                    } else if (otherBtns.length > 0) {
                        // Go to functional buttons below, respect column
                        nextTarget = otherBtns[Math.min(col, otherBtns.length - 1)];
                    }
                    handled = true;
                } else if (e.key === 'ArrowUp') {
                    if (row > 0) nextTarget = shopItems[itemIndex - 3];
                    handled = true; // Wall at top
                }
            } else if (otherBtns.includes(document.activeElement)) {
                const btnIdx = otherBtns.indexOf(document.activeElement);
                if (e.key === 'ArrowUp') {
                    // Try to go back to shop grid, last row
                    if (shopItems.length > 0) {
                        const rowCount = Math.ceil(shopItems.length / 3);
                        const targetItem = Math.min(shopItems.length - 1, (rowCount - 1) * 3 + btnIdx);
                        nextTarget = shopItems[targetItem];
                    }
                    handled = true;
                } else if (e.key === 'ArrowDown') {
                    // Check if there's a button below this one (e.g. "Buy All Random")
                    let nextBtnIdx = btnIdx + 3; // The second row starts at index 3 (Random, Sell, Next are 0,1,2)
                    if (otherBtns[nextBtnIdx]) nextTarget = otherBtns[nextBtnIdx];
                    handled = true; // Wall at bottom
                } else if (e.key === 'ArrowLeft') {
                    if (btnIdx > 0 && btnIdx !== 3) nextTarget = otherBtns[btnIdx - 1]; // btnIdx 3 is Buy All Random
                    handled = true;
                } else if (e.key === 'ArrowRight') {
                    if (btnIdx < otherBtns.length - 1 && btnIdx !== 2) nextTarget = otherBtns[btnIdx + 1];
                    handled = true;
                }
            }
        } else if (isMenu) {
            const menuBtnIds = ['b-down', 'b-up', 'p-down', 'p-up', 'start-btn'];
            const menuBtns = menuBtnIds.map(id => document.getElementById(id)).filter(el => el);
            const currIdx = menuBtns.indexOf(document.activeElement);

            if (currIdx !== -1) {
                if (e.key === 'ArrowDown') {
                    if (currIdx === 0) nextTarget = menuBtns[2]; // b-down -> p-down
                    else if (currIdx === 1) nextTarget = menuBtns[3]; // b-up -> p-up
                    else if (currIdx === 2 || currIdx === 3) nextTarget = menuBtns[4]; // p-down/up -> start
                    handled = true;
                } else if (e.key === 'ArrowUp') {
                    if (currIdx === 4) nextTarget = menuBtns[2]; // start -> p-down
                    else if (currIdx === 2) nextTarget = menuBtns[0]; // p-down -> b-down
                    else if (currIdx === 3) nextTarget = menuBtns[1]; // p-up -> b-up
                    handled = true;
                } else if (e.key === 'ArrowRight') {
                    if (currIdx === 0) nextTarget = menuBtns[1]; // b-down -> b-up
                    else if (currIdx === 2) nextTarget = menuBtns[3]; // p-down -> p-up
                    handled = true;
                } else if (e.key === 'ArrowLeft') {
                    if (currIdx === 1) nextTarget = menuBtns[0]; // b-up -> b-down
                    else if (currIdx === 3) nextTarget = menuBtns[2]; // p-up -> p-down
                    handled = true;
                }
            } else {
                nextTarget = menuBtns[0];
                handled = true;
            }
        }

        if (nextTarget) {
            e.preventDefault();
            nextTarget.focus();
            sfx.playUI();
            return;
        }

        if (handled) {
            e.preventDefault(); // Hit a wall, stop processing
            return;
        }

        // Fallback for simple linear navigation (Summary etc)
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIdx = (currentIndex + 1) % allFocusable.length;
            if (allFocusable[nextIdx]) allFocusable[nextIdx].focus();
            sfx.playUI();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIdx = (currentIndex - 1 + allFocusable.length) % allFocusable.length;
            if (allFocusable[prevIdx]) allFocusable[prevIdx].focus();
            sfx.playUI();
        } else if (e.key === 'Enter' || e.key === ' ') {
            if (document.activeElement && allFocusable.includes(document.activeElement)) {
                e.preventDefault();
                document.activeElement.click();
            }
        }
    }

});

// Init Debug UI
initDebugUI();
window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
    keys[e.key] = false;

    // Remove visual feedback
    removeVisualizeKeyPress(e.code);
    removeVisualizeKeyPress(e.key);

    // TV Remote D-Pad / Numpad Mappings (Keyup)
    if (e.key === '4') keys['arrowleft'] = false;
    if (e.key === '6') keys['arrowright'] = false;
    if (e.key === '2') keys['arrowup'] = false;
    if (e.key === '8') keys['arrowdown'] = false;

    if (e.key.toLowerCase() === 'r' || e.key === '0') {
        // Request restart confirmation
        let restartDialog = document.getElementById('restart-dialog');
        if (restartDialog) {
            restartDialog.classList.remove('hidden');
            document.getElementById('restart-no').focus(); // default focus on NO
            // Prevent further game input while dialog is active
            keys = {};
        } else {
            window.location.reload();
        }
        return;
    }

    if (e.code === 'Space' || e.key === 'Enter' || e.code === 'NumpadEnter' || e.key === '5') {
        keys['space'] = false;
        if (gameState === 'AIMING') {
            let t = tanks[currentPlayerIndex];
            if (t.actionMode === 'AIMING') {
                let eq = t.inventory[t.weaponIndex];
                if (eq.isItem) {
                    // It's a usable item (like Repair Kit)
                    eq.apply(t);
                    let currentId = eq.id;
                    t.inventory.splice(t.weaponIndex, 1);
                    let nextIdx = t.inventory.findIndex(i => i.id === currentId);
                    if (nextIdx !== -1) t.weaponIndex = nextIdx;
                    else t.weaponIndex = 0;

                    updateHUD();
                    sfx.playTurn();
                    passTurn();
                } else {
                    sfx.playShoot();
                    fireProjectile();
                }
            } else if (t.actionMode === 'MOVING') {
                sfx.playTurn();
                passTurn();
            }
        }
    }
});

// Touch / Mouse On-Screen Controls
const bindTouchControl = (id, keyName, isAction = false) => {
    let el = document.getElementById(id);
    if (!el) return;

    // Prevent right click / hold context menu
    el.addEventListener('contextmenu', e => e.preventDefault());

    const press = (e) => {
        e.preventDefault();
        keys[keyName] = true;
        if (isAction && gameState === 'AIMING') {
            let t = tanks[currentPlayerIndex];
            if (keyName === 'm') {
                t.actionMode = t.actionMode === 'AIMING' ? 'MOVING' : 'AIMING';
                sfx.playUI();
                updateHUD();
                keys['m'] = false; // acts as a toggle, auto release
            } else if (keyName === 'b') {
                let start = t.weaponIndex;
                do {
                    t.weaponIndex = (t.weaponIndex + 1) % t.inventory.length;
                } while (t.weaponIndex !== start && t.inventory.findIndex(i => i.id === t.inventory[t.weaponIndex].id) !== t.weaponIndex);
                sfx.playUI();
                updateHUD();
                showWeaponPopup(t.inventory[t.weaponIndex].name);
                keys['b'] = false;
            } else if (keyName === 'space') {
                // We let the keyup equivalent handle the actual fire logic to match keyboard
            }
        }
    };

    const release = (e) => {
        e.preventDefault();
        if (!keys[keyName]) return; // already handled
        keys[keyName] = false;

        if (keyName === 'space' && gameState === 'AIMING') {
            let t = tanks[currentPlayerIndex];
            if (t.actionMode === 'AIMING') {
                let eq = t.inventory[t.weaponIndex];
                if (eq.isItem) {
                    eq.apply(t);
                    let currentId = eq.id;
                    t.inventory.splice(t.weaponIndex, 1);
                    let nextIdx = t.inventory.findIndex(i => i.id === currentId);
                    if (nextIdx !== -1) t.weaponIndex = nextIdx;
                    else t.weaponIndex = 0;
                    updateHUD();
                    sfx.playTurn();
                    passTurn();
                } else {
                    sfx.playShoot();
                    fireProjectile();
                }
            } else if (t.actionMode === 'MOVING') {
                sfx.playTurn();
                passTurn();
            }
        }
    };

    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointerleave', release);
};

// Bind D-pad
bindTouchControl('btn-up', 'arrowup');
bindTouchControl('btn-down', 'arrowdown');
bindTouchControl('btn-left', 'arrowleft');
bindTouchControl('btn-right', 'arrowright');
bindTouchControl('btn-ok', 'space', true); // act as center action button

// Bind Actions
bindTouchControl('btn-wpn', 'b', true);
bindTouchControl('btn-move', 'm', true);

// Bind Audio UI (Globally Actionable)
let btnMute = document.getElementById('btn-mute');
if (btnMute) btnMute.onclick = () => { bgm.toggleMute(); sfx.playUI(); };

let btnNext = document.getElementById('btn-next');
if (btnNext) btnNext.onclick = () => { bgm.nextTrack(); sfx.playUI(); };

// Fullscreen Toggle
let btnFullscreen = document.getElementById('btn-fullscreen');
if (btnFullscreen) {
    btnFullscreen.onclick = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
        sfx.playUI();
    };
}


class RigidRock {
    constructor(x, y, br, numVerts) {
        this.x = x * CELL;
        this.y = y * CELL;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = 0;
        this.angle = Math.random() * Math.PI * 2;
        this.va = (Math.random() - 0.5) * 0.3;
        this.br = br * CELL;
        this.verts = [];
        for (let i = 0; i < numVerts; i++) {
            let a = (i / numVerts) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            let r = br * CELL * (0.8 + Math.random() * 0.4);
            this.verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        }
        this.settled = false;
        this.settleTimer = 0;
    }

    update() {
        if (this.settled) return;
        this.vy += 0.3; // gravity
        this.x += this.vx;
        this.y += this.vy;
        this.angle += this.va;

        // "Glue" effect: Check if we are touching settled rocks in the grid
        let gx = Math.floor(this.x / CELL);
        let gy = Math.floor(this.y / CELL);
        let touchingSettled = false;

        // Check a few points around the center for "stickiness"
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                let nx = gx + dx, ny = gy + dy;
                if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
                    if (grid[ny * GW + nx] === TYPE_ROCK) {
                        touchingSettled = true;
                        break;
                    }
                }
            }
            if (touchingSettled) break;
        }

        let bottom = (GH - 1) * CELL;
        if (this.y + this.br > bottom || touchingSettled) {
            if (!touchingSettled) this.y = bottom - this.br;
            this.vy *= -0.15; // very dampened bounce
            this.vx *= 0.4;
            this.va *= 0.3;

            if (Math.abs(this.vy) < 0.6 && Math.abs(this.vx) < 0.6) {
                this.settleTimer++;
                if (this.settleTimer > 5) { // Settle almost instantly for glue effect
                    this.settled = true;
                }
            } else {
                this.settleTimer = 0;
                // High stickiness probability
                if (touchingSettled && Math.random() < 0.4) this.settled = true;
            }
        }

        if (this.x - this.br < 0) { this.x = this.br; this.vx *= -0.5; }
        if (this.x + this.br > GW * CELL) { this.x = GW * CELL - this.br; this.vx *= -0.5; }
    }

    pasteToGrid() {
        let minX = Math.floor((this.x - this.br * 2) / CELL);
        let maxX = Math.ceil((this.x + this.br * 2) / CELL);
        let minY = Math.floor((this.y - this.br * 2) / CELL);
        let maxY = Math.ceil((this.y + this.br * 2) / CELL);
        let cos = Math.cos(-this.angle), sin = Math.sin(-this.angle);

        for (let ry = minY; ry <= maxY; ry++) {
            for (let rx = minX; rx <= maxX; rx++) {
                if (rx < 0 || rx >= GW || ry < 0 || ry >= GH) continue;
                let lx = rx * CELL - this.x, ly = ry * CELL - this.y;
                let px = lx * cos - ly * sin, py = lx * sin + ly * cos;
                let inside = true;
                for (let i = 0; i < this.verts.length; i++) {
                    let p1 = this.verts[i], p2 = this.verts[(i + 1) % this.verts.length];
                    if ((p2.x - p1.x) * (py - p1.y) - (p2.y - p1.y) * (px - p1.x) < 0) { inside = false; break; }
                }
                if (inside) grid[ry * GW + rx] = TYPE_ROCK;
            }
        }
    }
}

class Tank {
    constructor(id, isBot = false) {
        this.id = id;
        this.isBot = isBot;
        this.name = isBot ? `Bot ${(id - pCount) + 1}` : `Player ${id + 1}`;
        this.hp = 100;
        this.shield = 0;
        this.alive = true;
        this.x = 0; this.y = 0;
        this.angle = Math.PI / 4;
        this.power = 25;
        this.money = 500;
        this.inventory = [WEAPONS[0]]; // owned weapons
        this.weaponIndex = 0;
        this.fuel = 1000.0; // "10 liters" = 1000 pixels
        this.actionMode = 'AIMING';
        this.firstSpawn = true;
        this.wasInWater = false;
        this.lastEvent = null;  // floating toast text
        this.lastEventTimer = 0;
        this.isFalling = false;
        this.fallStartY = 0;
        this.isBuried = false;
        this.moveTargetX = null;
        this.shotsFired = 0;
    }
    spawn() {
        let totalTanks = tanks.length > 0 ? tanks.length : (pCount + bCount);
        let sectionWidth = Math.max(1, Math.floor((GW - 40) / totalTanks));
        let startX = 20 + this.id * sectionWidth;
        let randomOff = Math.floor(Math.random() * (sectionWidth * 0.8));
        this.x = (startX + randomOff) * CELL;
        this.y = 0;
        this.hp = 100;
        this.alive = true;
        if (this.firstSpawn) {
            this.angle = (this.x > canvas.width / 2) ? Math.PI * 0.75 : Math.PI * 0.25;
            this.firstSpawn = false;
        }
        this.weaponIndex = 0; // reset to basic
        this.actionMode = 'AIMING';
        this.moveTargetX = null;
    }
    fall() {
        if (!this.alive) return;
        let cx = Math.floor(this.x / CELL);
        let cy = Math.floor(this.y / CELL);

        // find ground top-down
        let topGroundY = GH - 1;
        let surfaceType = TYPE_AIR;
        for (let py = 0; py < GH; py++) {
            let typ = grid[py * GW + cx];
            // Trunks are solid but transform if hit by tank (handled below)
            // Leaves are NOT solid
            if (typ !== TYPE_AIR && typ !== TYPE_WATER && typ !== TYPE_LEAF) {
                topGroundY = py;
                surfaceType = typ;
                break;
            }
        }

        // Check if tank is buried relative to top ground
        let targetY = topGroundY * CELL;
        this.isBuried = false;
        if (this.y > targetY + 10) {
            this.isBuried = true;
            // If buried, find local ground *below* the tank instead of the top surface
            topGroundY = GH - 1;
            for (let py = cy; py < GH; py++) {
                let typ = grid[py * GW + cx];
                if (typ !== TYPE_AIR && typ !== TYPE_WATER && typ !== TYPE_LEAF && py > cy) {
                    topGroundY = py - 1; // Stand on top of the found solid
                    break;
                }
            }
            targetY = topGroundY * CELL;
        }

        // Hit trunk logic: if tank overlaps trunk, trunk -> sand
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                let nx = cx + dx, ny = Math.floor(this.y / CELL) + dy;
                if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
                    if (grid[ny * GW + nx] === TYPE_WOOD) {
                        grid[ny * GW + nx] = TYPE_SAND; // Tank crushes trunk to sand
                        gridUpdated = true;
                    }
                }
            }
        }

        // FREEZE POSITION DURING DISASTERS
        // This allows particles like sand/rock to bury the tank without the tank popping up
        if (disasters.length > 0) {
            this.isFalling = false;
            return;
        }

        let wasFalling = this.isFalling;
        this.isFalling = false;

        if (surfaceType === TYPE_LAVA && !this.isBuried) {
            let solidY = topGroundY;
            for (let py = topGroundY; py < GH; py++) {
                let typ = grid[py * GW + cx];
                if (typ !== TYPE_AIR && typ !== TYPE_WATER && typ !== TYPE_LAVA) { solidY = py; break; }
            }
            let solidTarget = solidY * CELL;

            if (this.y < targetY) {
                this.y += 3;
                this.isFalling = true;
                if (this.y > targetY) this.y = targetY;
            } else if (this.y < solidTarget) {
                this.y += 0.2; // sink slowly in lava
            } else if (this.y > solidTarget) {
                this.y = solidTarget;
            }
        } else {
            // normal solid ground or local ground if buried
            if (this.y < targetY) {
                if (!this.isFalling) {
                    this.fallStartY = this.y;
                }
                this.y += 3;
                this.isFalling = true;
                if (this.y > targetY) this.y = targetY;
            } else if (this.y > targetY && !this.isBuried) {
                this.y = targetY; // snap immediately to surface if NOT buried
            }
        }

        // Damage check when landing
        if (wasFalling && !this.isFalling) {
            let dist = this.y - this.fallStartY;
            if (dist > 20) {
                this.takeDamage(1, null);
            }
        }
    }
    takeDamage(amt, sourceTank) {
        if (!this.alive) return;
        if (this.shield > 0) {
            let dmg = Math.min(this.shield, amt);
            this.shield -= dmg;
            amt -= dmg;
        }
        this.hp -= amt;
        if (amt > 0.5) {
            this.lastEvent = `\u2212${Math.round(amt)} HP`;
            this.lastEventTimer = 90;
        }
        if (sourceTank && sourceTank !== this) {
            sourceTank.money += Math.floor(amt);
        }
        if (this.hp <= 0 && this.alive) {
            this.hp = 0; this.alive = false;
            this.lastEvent = '\ud83d\udc80 KO';
            this.lastEventTimer = 120;
            explodeAt(this.x, this.y, 100, true);
            if (sourceTank && sourceTank !== this) sourceTank.money += 200;
        }
        renderHealthBars();
    }
    draw(ctx) {
        if (!this.alive) return;
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = '#000'; // Purely black
        // Custom Pixel-art Tank
        const tankSprite = [
            "         011         ",
            "      0000000      ",
            "     00010000      ",
            "  0000000000000    ",
            " 00000000000000000 ",
            "001010101101010100",
            "001010101101010100",
            " 00000000000000000 "
        ];

        let sc = 2; // scale of tank pixels
        let bx = -(tankSprite[0].length * sc) / 2;
        let by = -(tankSprite.length * sc);

        for (let r = 0; r < tankSprite.length; r++) {
            for (let c = 0; c < tankSprite[r].length; c++) {
                let char = tankSprite[r][c];
                if (char === '0') {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(bx + c * sc, by + r * sc, sc, sc);
                } else if (char === '1') {
                    ctx.fillStyle = '#fff'; // White details
                    ctx.fillRect(bx + c * sc, by + r * sc, sc, sc);
                }
            }
        }

        if (this.shield > 0) {
            ctx.strokeStyle = '#000';
            ctx.setLineDash([2, 2]);
            ctx.beginPath(); ctx.arc(0, by + 5, 24, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(0, by + 4); // base of turret
        let barrelLen = 20;
        ctx.lineTo(Math.cos(this.angle) * barrelLen, by + 4 - Math.sin(this.angle) * barrelLen);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw Parachute
        if (this.isFalling) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, by - 15, 20, Math.PI, 0);
            ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-20, by - 15); ctx.lineTo(-8, by);
            ctx.moveTo(20, by - 15); ctx.lineTo(8, by);
            ctx.moveTo(0, by - 15); ctx.lineTo(0, by);
            ctx.stroke();
        }

        if (this === tanks[currentPlayerIndex] && gameState === 'AIMING') {
            // Draw Indicator Arrow (Red Triangle)
            let totalScale = (window.innerHeight / 1080) * camZoom;
            let invScale = 1 / totalScale;
            let jump = Math.sin(Date.now() * 0.005) * 5 * invScale;
            let triangleSize = 100 * invScale;
            let yOffset = -50 * invScale - jump;

            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.moveTo(0, yOffset);
            ctx.lineTo(-triangleSize / 2, yOffset - triangleSize);
            ctx.lineTo(triangleSize / 2, yOffset - triangleSize);
            ctx.fill();

            // Draw player identifier above the arrow
            ctx.fillStyle = '#ffffff';
            ctx.font = `${14 * invScale}px "Press Start 2P"`;
            ctx.textAlign = 'center';
            ctx.fillText("YOUR TURN", 0, yOffset - triangleSize - 10 * invScale);

            // Trace trajectory (Fading Ballistic Arc)
            if (this.actionMode === 'AIMING') {
                ctx.beginPath();
                let sx = 0;
                let sy = by + 4;
                ctx.moveTo(sx, sy);

                let w = this.inventory[this.weaponIndex];
                let projSpeed = w ? w.speed : 1.0;

                // Physics constants matching Projectile class
                let vox = Math.cos(this.angle) * (this.power * 0.5) * projSpeed;
                let voy = -Math.sin(this.angle) * (this.power * 0.5) * projSpeed;
                const grav = 0.5;

                let simX = sx;
                let simY = sy;

                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 2;

                // Check if user toggled 'T' for full debug trace
                const isDebugTrace = window.debugTrajectory;

                // We want to simulate the exact frame-by-frame logic of Projectile.update
                // Rather than drawing every single frame (too dense), we draw a line segment every N frames
                let pathPoints = [];
                let pX = this.x + sx; // world space
                let pY = this.y + sy; // world space
                let pVX = vox;
                let pVY = voy;

                pathPoints.push({ x: sx, y: sy });

                const maxSimFrames = isDebugTrace ? 900 : 45; // 45 frames is ~15 segments of 3
                for (let f = 1; f <= maxSimFrames; f++) {
                    pX += pVX;
                    pY += pVY;
                    pVY += 0.2; // Exact gravity from Projectile.update

                    if (f % 3 === 0) { // Record a point every 3 frames for dashing
                        pathPoints.push({ x: pX - this.x, y: pY - this.y });
                    }

                    // Collision check
                    let cx = Math.floor(pX / CELL);
                    let cy = Math.floor(pY / CELL);

                    if (cy >= 0 && cy < GH && cx >= 0 && cx < GW) {
                        if (grid[cy * GW + cx] > 0 && grid[cy * GW + cx] !== TYPE_WATER && grid[cy * GW + cx] !== TYPE_LAVA) {
                            if (f % 3 !== 0) pathPoints.push({ x: pX - this.x, y: pY - this.y }); // Add final exact point
                            break;
                        }
                    }
                    if (pY > canvas.height + 500) break;
                }

                // Now draw the collected points
                ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
                for (let i = 1; i < pathPoints.length; i++) {
                    ctx.beginPath();
                    ctx.moveTo(pathPoints[i - 1].x, pathPoints[i - 1].y);
                    ctx.lineTo(pathPoints[i].x, pathPoints[i].y);

                    if (isDebugTrace) {
                        ctx.strokeStyle = `rgba(0, 0, 0, 0.1)`;
                    } else {
                        // Fade out over the short distance, starting at 10% opacity
                        let progress = i / pathPoints.length;
                        ctx.strokeStyle = `rgba(0, 0, 0, ${(1.0 - progress) * 0.1})`;
                    }
                    ctx.stroke();
                }

                // Pin Angle and Power text near the end of the trace
                let lastPoint = pathPoints[pathPoints.length - 1] || pathPoints[0];
                simX = lastPoint.x;
                simY = lastPoint.y;

                ctx.setLineDash([]);
                ctx.globalAlpha = 1.0; // Reset alpha

                // Pin Angle and Power text near the end of the arc
                ctx.font = '8px "Press Start 2P"';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#000';
                ctx.fillText(`A:${Math.floor(this.angle * 180 / Math.PI)}° P:${Math.floor(this.power)}`, simX, simY - 10);
            }
        } else {
            // If not active, just draw their basic nameplate lower
            ctx.fillStyle = '#000'; ctx.font = '8px "Press Start 2P"'; ctx.textAlign = 'center';
            ctx.fillText(`P${this.id + 1}`, 0, -25);
        }

        if (this === tanks[currentPlayerIndex] && gameState === 'AIMING') {
            let eq = this.inventory[this.weaponIndex];
            ctx.fillStyle = '#a00';
            ctx.font = '24px "Press Start 2P"'; // 3x bigger than default 8px
            let textToDisplay = this.actionMode === 'MOVING' ? "MOVE" : (eq ? eq.name : '');
            ctx.fillText(textToDisplay, 0, -90); // Move higher up
        }

        ctx.restore();
    }
}

class PhysicsParticle {
    constructor(x, y, vx, vy, type) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.type = type;
        this.active = true;
    }
    update() {
        if (!this.active) return;
        this.x += this.vx; this.y += this.vy;
        this.vy += 0.2; // gravity
        this.vx *= 0.99; // air resistance

        // Contact with players?
        for (let t of tanks) {
            if (!t.alive) continue;
            let dx = this.x - t.x;
            let dy = this.y - t.y;
            // Tank approx 40px wide, high (bounding box)
            if (Math.abs(dx) < 20 && dy < 5 && dy > -20) {
                if (this.type === TYPE_LAVA) {
                    t.takeDamage(1, null);
                    this.type = TYPE_SAND;
                }
                // Burial logic: force particle to settle right now above the tank instead of inside the bounding box
                let px = Math.floor(this.x / CELL);
                let py = Math.floor(this.y / CELL); // Start at current particle Y
                if (px >= 0 && px < GW && py >= 0 && py < GH) {
                    // To safely bury without glitching the tank upwards, stack material on top of the uppermost solid block
                    let foundSurface = false;
                    for (let up = 0; up < 25; up++) {
                        let ty = py - up;
                        if (ty >= 0 && grid[ty * GW + px] === TYPE_AIR) {
                            grid[ty * GW + px] = this.type;
                            if (this.type === TYPE_LAVA) materialAge[ty * GW + px] = 0;
                            markActiveArea(this.x, 20);
                            this.active = false;
                            foundSurface = true;
                            break;
                        }
                    }
                    if (foundSurface) return;
                }
            }
        }

        let px = Math.floor(this.x / CELL);
        let py = Math.floor(this.y / CELL);

        if (px < 0 || px >= GW || py >= GH) {
            this.active = false;
        } else if (py >= 0) {
            if (grid[py * GW + px] !== TYPE_AIR && grid[py * GW + px] !== TYPE_WATER) {
                // Settle
                let settled = false;
                // If it hits ROCK and it's LAVA, occasionally slip "behind" it visually by sinking deeper,
                // or just settle normally for other types
                let slipDepth = (this.type === TYPE_LAVA && grid[py * GW + px] === TYPE_ROCK) ? 15 : 10;

                for (let up = 0; up < slipDepth; up++) {
                    let ty = py - up;
                    if (ty >= 0 && grid[ty * GW + px] === TYPE_AIR) {
                        grid[ty * GW + px] = this.type;
                        if (this.type === TYPE_LAVA) materialAge[ty * GW + px] = 0; // reset age
                        markActiveArea(this.x, 20);
                        settled = true;
                        break;
                    }
                }
                this.active = false;
            }
        }
    }
    draw(ctx) {
        let c = '#888';
        if (this.type === TYPE_EARTH) c = '#654321'; // Brown
        else if (this.type === TYPE_SAND) c = '#f2d26b'; // Yellow
        else if (this.type === TYPE_ROCK) c = '#141414'; // Dark Gray [20,20,20]
        else if (this.type === TYPE_LAVA) c = '#ff4500'; // Orange/Red
        else if (this.type === TYPE_TOXIC_WATER) c = '#32cd32'; // Lime Green

        ctx.fillStyle = c;
        // Draw slightly larger than 1 pixel for visibility if needed, or 1 CELL
        ctx.fillRect(this.x, this.y, CELL, CELL);
    }
}

class Projectile {
    constructor(x, y, vx, vy, weapon, owner) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.w = weapon; this.owner = owner;
        this.active = true;
        this.life = 600; // 10 seconds (60 frames/sec)
        this.lastVy = vy;

        // Irregular rock shapes for Volcano
        if (this.w.special === 'MELT_TO_LAVA') {
            this.verts = [];
            let numLines = 5 + Math.floor(Math.random() * 4);
            for (let i = 0; i < numLines; i++) {
                let angle = (i / numLines) * Math.PI * 2;
                let r = (this.w.radius * 0.2) * (0.6 + Math.random() * 0.8);
                this.verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
            }
        }
    }
    update() {
        if (!this.active) return;

        this.life--;
        if (this.life <= 0) {
            this.active = false;
            return;
        }

        this.x += this.vx; this.y += this.vy;
        this.vy += 0.2; // grav

        // Apex detection for multiple types
        let isApex = this.lastVy < 0 && this.vy >= 0;
        if (isApex) {
            if (this.w.special === 'TOXIC_RAIN' || this.w.special === 'ACID_RAIN') {
                this.explode();
                return;
            }
            if (this.w.special === 'MIRV') {
                this.active = false;
                for (let i = 0; i < 3; i++) {
                    let subW = { ...this.w, special: 'NORMAL', name: 'Sub-missile' };
                    let vx = this.vx + (Math.random() - 0.5) * 2;
                    let vy = this.vy + Math.random() * 2;
                    projectiles.push(new Projectile(this.x, this.y, vx, vy, subW, this.owner));
                }
                sfx.playExplosion();
                return;
            }
        }
        this.lastVy = this.vy;

        if (this.w.special === 'HOMING' && this.vy > -2) {
            let target = this.target;
            if (!target) {
                let minDist = Infinity;
                for (let t of tanks) {
                    if (!t.alive || t === this.owner) continue;
                    let dx = t.x - this.x, dy = (t.y - 10) - this.y;
                    let dist = dx * dx + dy * dy;
                    if (dist < minDist) { minDist = dist; target = t; }
                }
            }
            if (target && target.alive) {
                let dx = target.x - this.x;
                let dy = (target.y - 10) - this.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0) {
                    this.vx += (dx / dist) * 0.5;
                    this.vy += (dy / dist) * 0.5 - 0.2; // negate gravity
                    let speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                    if (speed > 5) { this.vx = (this.vx / speed) * 5; this.vy = (this.vy / speed) * 5; }
                    if (Math.random() < 0.5) particles.push(new Particle(this.x, this.y, 0, 0, '#ffa500', 15)); // thrust flame
                }
            }
        }

        if (this.w.special === 'MELT_TO_LAVA') {
            // Lava trail
            if (Math.random() < 0.4) {
                particles.push(new Particle(this.x, this.y, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, '#ff4500', 15 + Math.random() * 15));
            }
        } else {
            if (Math.random() > 0.5) particles.push(new Particle(this.x, this.y, 0, 0, '#000', 10));
        }

        if (this.w.special === 'BOUNCE') {
            if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); this.w.damage *= 0.95; }
            if (this.x > canvas.width) { this.x = canvas.width; this.vx = -Math.abs(this.vx); this.w.damage *= 0.95; }
            if (this.y < -1500) { this.vy = Math.abs(this.vy); } // don't fly away up
        } else {
            if (this.x < 0 || this.x > canvas.width || this.y > canvas.height || this.y < -1500) this.active = false;
        }

        if (this.active && this.y > 0 && this.x >= 0 && this.x <= canvas.width) {
            let cx = Math.floor(this.x / CELL);
            let cy = Math.floor(this.y / CELL);
            if (cy < GH && grid[cy * GW + cx] !== TYPE_AIR) {
                if (grid[cy * GW + cx] === TYPE_WATER) {
                    // Splash effect and slow down
                    if (Math.random() < 0.5) {
                        for (let i = 0; i < 3; i++) {
                            physicsParticles.push(new PhysicsParticle(this.x, this.y, (Math.random() - 0.5) * 4, -1 - Math.random() * 2, TYPE_WATER));
                        }
                    }
                    this.vx *= 0.5;
                    this.vy *= 0.5;
                    // Push water away
                    let pushDist = 2;
                    for (let dy = -pushDist; dy <= pushDist; dy++) {
                        for (let dx = -pushDist; dx <= pushDist; dx++) {
                            let nx = cx + dx, ny = cy + dy;
                            if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
                                if (grid[ny * GW + nx] === TYPE_WATER) {
                                    // Try to find a nearby air spot to displace water
                                    let randX = nx + (Math.random() < 0.5 ? 1 : -1);
                                    let randY = ny + (Math.random() < 0.5 ? 1 : -1);
                                    if (randX >= 0 && randX < GW && randY >= 0 && randY < GH && grid[randY * GW + randX] === TYPE_AIR) {
                                        grid[randY * GW + randX] = TYPE_WATER;
                                        grid[ny * GW + nx] = TYPE_AIR;
                                        gridUpdated = true;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    if (this.w.special === 'BOUNCE') {
                        this.bounce(cx, cy);
                    } else if (this.w.special === 'DRILL') {
                        // Carve a small hole and keep going
                        carveGrid(this.x, this.y, this.w.radius, true);
                        this.w.damage *= 0.8; // lose damage as it drills
                        if (this.w.damage < 10) this.explode();
                    } else {
                        this.explode();
                    }
                }
            } else {
                // We are passing through AIR or WATER
                if (cy < GH && grid[cy * GW + cx] === TYPE_WATER) {
                    if (this.w.name === 'Meteor') {
                        // Meteor making splashes in water
                        if (Math.random() < 0.3) {
                            physicsParticles.push(new PhysicsParticle(this.x, this.y, (Math.random() - 0.5) * 4, -2 - Math.random() * 3, TYPE_WATER));
                        }
                    } else if (this.w.name === 'Volcanic Rock' || this.w.name === 'Rock') {
                        // Meteor making splashes in water too
                        if (Math.random() < 0.3) {
                            physicsParticles.push(new PhysicsParticle(this.x, this.y, (Math.random() - 0.5) * 4, -2 - Math.random() * 3, TYPE_WATER));
                        }

                        // Rock pushing water away horizontally and slightly UP
                        let targetCx = -1, targetCy = -1;
                        for (let dy = -2; dy <= 0; dy++) {
                            for (let dx = 1; dx <= 3; dx++) {
                                if (cx - dx >= 0 && cy + dy >= 0 && grid[(cy + dy) * GW + (cx - dx)] === TYPE_AIR) {
                                    targetCx = cx - dx; targetCy = cy + dy; break;
                                }
                                if (cx + dx < GW && cy + dy >= 0 && grid[(cy + dy) * GW + (cx + dx)] === TYPE_AIR) {
                                    targetCx = cx + dx; targetCy = cy + dy; break;
                                }
                            }
                            if (targetCx !== -1) break;
                        }

                        if (targetCx !== -1) {
                            grid[targetCy * GW + targetCx] = TYPE_WATER;
                            // Leave a cooled ROCK trail instead of AIR
                            grid[cy * GW + cx] = TYPE_ROCK;
                            gridUpdated = true;
                            markActiveArea(this.x, 20); // Wake up the affected water/rock
                        } else {
                            // If no space to push water, still turn water to rock
                            grid[cy * GW + cx] = TYPE_ROCK;
                            gridUpdated = true;
                            markActiveArea(this.x, 20);
                        }
                    }
                }
                for (let t of tanks) {
                    if (!t.alive || t === this.owner && this.vy < 0) continue; // don't instantly hit self
                    let dx = t.x - this.x, dy = t.y - this.y;
                    if (dx * dx + dy * dy < 200) { this.explode(); break; }
                }
                if (this.active && this.w.special !== 'BOUNCE') {
                    for (let e of staticEntities) {
                        if (!e.active || e.state === 'BURNING') continue;
                        let dx = e.x - this.x, dy = (e.y - 30) - this.y;
                        if (dx * dx + dy * dy < 1000) { this.explode(); break; }
                    }
                }
            }
        }
    }
    explode() {
        this.active = false;
        let r = this.w.radius;
        carveGrid(this.x, this.y, r, this.w.destroysRock);
        carveGrid(this.x, this.y, r, this.w.destroysRock);
        explodeAt(this.x, this.y, r, false);

        for (let t of tanks) {
            if (!t.alive) continue;
            let dx = t.x - this.x, dy = (t.y - 5) - this.y; // tank center
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < r) {
                let dmg = this.w.damage * (1 - dist / r);
                t.takeDamage(dmg, this.owner);
            }
        }

        // Special behaviors
        if (this.w.special === 'TELEPORT') {
            this.owner.x = this.x;
            this.owner.y = this.y - 15;
            this.owner.isFalling = true;
            for (let i = 0; i < 20; i++) particles.push(new Particle(this.owner.x + (Math.random() - 0.5) * 30, this.owner.y + (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, '#0ff', 30));
        } else if (this.w.special === 'SHATTER') {
            for (let i = 0; i < 5; i++) {
                let fw = { name: 'Shrapnel', damage: 15, radius: 15, count: 1, speed: 1, spread: 0, cost: 0, destroysRock: false };
                let vx = (Math.random() - 0.5) * 6;
                let vy = -3 - Math.random() * 5;
                projectiles.push(new Projectile(this.x, this.y - 5, vx, vy, fw, this.owner));
            }
        } else if (this.w.special === 'BIG_SHATTER') {
            for (let i = 0; i < 12; i++) {
                let fw = { name: 'Small Grenade', damage: 30, radius: 25, count: 1, speed: 1, spread: 0, cost: 0, destroysRock: true };
                let angle = (i / 12) * Math.PI * 2;
                let spd = 4 + Math.random() * 3;
                let vx = Math.cos(angle) * spd;
                let vy = Math.sin(angle) * spd - 2; // slight upward bias
                projectiles.push(new Projectile(this.x, this.y - 5, vx, vy, fw, this.owner));
            }
        } else if (this.w.special === 'EMP') {
            for (let t of tanks) {
                if (!t.alive) continue;
                let dx = t.x - this.x, dy = t.y - this.y;
                if (Math.sqrt(dx * dx + dy * dy) < r) {
                    t.shield = 0; // obliterate shields
                }
            }
        } else if (this.w.special === 'NAPALM' || this.w.special === 'LAVA_ROCK_SMALL' || this.w.special === 'LAVA_ROCK_LARGE') {
            let cx = Math.floor(this.x / CELL);
            let cy = Math.floor(this.y / CELL);
            let lavr = this.w.special === 'LAVA_ROCK_LARGE' ? 12 : (this.w.special === 'LAVA_ROCK_SMALL' ? 4 : 5);
            for (let dy = -lavr; dy <= lavr; dy++) {
                for (let dx = -lavr; dx <= lavr; dx++) {
                    if (dx * dx + dy * dy > lavr * lavr) continue; // Circular check
                    let nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && nx < GW && ny >= 0 && ny < GH && Math.random() < 0.8) {
                        if (grid[ny * GW + nx] !== TYPE_TREE) { // trees degrade via carveGrid, not lava
                            grid[ny * GW + nx] = TYPE_LAVA;
                            materialAge[ny * GW + nx] = 0; // Reset aging for new lava
                        }
                    }
                }
            }
            gridUpdated = true;
            applyUFOImpact(this.x, this.y); // Creates UFO lava pool and tank damage
        } else if (this.w.special === 'QUAKE') {
            screenShake = 60;
            for (let i = 0; i < grid.length; i++) {
                if (grid[i] === TYPE_ROCK && Math.random() < 0.05) grid[i] = TYPE_EARTH;
            }
            gridUpdated = true;
        } else if (this.w.special === 'GAS') {
            // Poison gas cloud logic - spreads heavily over area but low burn damage
            for (let i = 0; i < 20; i++) {
                particles.push(new Particle(this.x + (Math.random() - 0.5) * 60, this.y + (Math.random() - 0.5) * 60, 0, -0.2, '#0f0', 80));
            }
            tanks.forEach(t => { if (Math.abs(t.x - this.x) < 80 && Math.abs(t.y - this.y) < 80) t.takeDamage(25, this.owner); });
        } else if (this.w.special === 'LASER') {
            // Intense vertical beam effect
            for (let py = this.y; py > -100; py -= 10) {
                particles.push(new Particle(this.x, py, 0, 0, '#f00', 40));
            }
        } else if (this.w.special === 'MELT_TO_LAVA') {
            let cx = Math.floor(this.x / CELL);
            let cy = Math.floor(this.y / CELL);
            let meltR = Math.floor(this.w.radius / CELL);
            for (let dy = -meltR; dy <= meltR; dy++) {
                for (let dx = -meltR; dx <= meltR; dx++) {
                    if (dx * dx + dy * dy > meltR * meltR) continue;
                    let nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
                        grid[ny * GW + nx] = TYPE_LAVA;
                        materialAge[ny * GW + nx] = 0;
                    }
                }
            }
            gridUpdated = true;
            // Visual splash
            for (let i = 0; i < 20; i++) {
                physicsParticles.push(new PhysicsParticle(this.x, this.y, (Math.random() - 0.5) * 10, -Math.random() * 8, TYPE_LAVA));
            }
            applyUFOImpact(this.x, this.y); // Apply the shared UFO impact mechanics
        } else if (this.w.special === 'TOXIC_RAIN' || this.w.special === 'ACID_RAIN') {
            // Explode into colored rain
            let type = TYPE_TOXIC_WATER;
            for (let i = 0; i < 100; i++) {
                let vx = (Math.random() - 0.5) * 6;
                let vy = Math.random() * 8;
                physicsParticles.push(new PhysicsParticle(this.x, this.y, vx, vy, type));
            }
        } else if (this.w.special === 'CLUSTER') {
            for (let i = 0; i < 8; i++) {
                let subW = { name: 'Mine', damage: 20, radius: 20, count: 1, speed: 1, spread: 0, cost: 0, destroysRock: true };
                let vx = (Math.random() - 0.5) * 8;
                let vy = -2 - Math.random() * 6;
                projectiles.push(new Projectile(this.x, this.y - 5, vx, vy, subW, this.owner));
            }
        } else if (this.w.special === 'ICE_SHARD') {
            for (let i = 0; i < 40; i++) {
                physicsParticles.push(new PhysicsParticle(this.x, this.y, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, TYPE_ROCK));
            }
        } else if (this.w.special === 'LAVA_SLUG') {
            for (let i = 0; i < 60; i++) {
                physicsParticles.push(new PhysicsParticle(this.x, this.y, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, TYPE_LAVA));
            }
        } else if (this.w.special === 'DIRTY_BOMB') {
            for (let i = 0; i < 150; i++) {
                physicsParticles.push(new PhysicsParticle(this.x, this.y, (Math.random() - 0.5) * 15, -Math.random() * 15, TYPE_SAND));
            }
        } else if (this.w.special === 'VACUUM' || this.w.special === 'BLACK_HOLE' || this.w.special === 'SONIC') {
            let mult = this.w.special === 'BLACK_HOLE' ? 2 : (this.w.special === 'SONIC' ? 1.5 : 1);
            carveGrid(this.x, this.y, r * mult, true);
            carveGrid(this.x, this.y, r * mult, true);
            if (this.w.special === 'BLACK_HOLE') screenShake = 80;
        } else if (this.w.special === 'PLASMA') {
            explodeAt(this.x, this.y, r * 1.5, true);
            for (let i = 0; i < 30; i++) particles.push(new Particle(this.x, this.y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, '#f0f', 40));
        } else if (this.w.special === 'METEORITE') {
            carveGrid(this.x, this.y, r * 1.2, true);
            for (let i = 0; i < 20; i++) physicsParticles.push(new PhysicsParticle(this.x, this.y, (Math.random() - 0.5) * 10, -Math.random() * 10, TYPE_ROCK));
        }
    }

    bounce(cx, cy) {
        // loose energy / damage over time
        this.w.damage *= 0.95; // loose damage and energy loosely
        if (this.w.damage < 5) this.w.damage = 5; // maintain min damage

        let normalX = 0, normalY = -1;
        if (grid[cy * GW + cx - 1] !== TYPE_AIR && grid[cy * GW + cx - 1] !== TYPE_WATER) normalX = 1;
        if (grid[cy * GW + cx + 1] !== TYPE_AIR && grid[cy * GW + cx + 1] !== TYPE_WATER) normalX = -1;

        let dot = this.vx * normalX + this.vy * normalY;
        this.vx = (this.vx - 2 * dot * normalX) * 0.9;
        this.vy = (this.vy - 2 * dot * normalY) * 0.9;
        this.y -= 2; // push out

        let speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed < 3.0) {
            // Keep it moving to find a target!
            if (this.vy === 0) this.vy = -3;
            this.vx = (this.vx / speed) * 3.0;
            this.vy = (this.vy / speed) * 3.0;
        }
    }
    draw(ctx) {
        if (!this.active) return;
        if (this.w.special === 'MELT_TO_LAVA' && this.verts) {
            ctx.fillStyle = '#111'; // Black rock
            ctx.beginPath();
            ctx.moveTo(this.x + this.verts[0].x, this.y + this.verts[0].y);
            for (let i = 1; i < this.verts.length; i++) {
                ctx.lineTo(this.x + this.verts[i].x, this.y + this.verts[i].y);
            }
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(this.x, this.y, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
}

class Particle {
    constructor(x, y, vx, vy, c, life) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.c = c; this.life = life; this.m = life;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.vy += 0.1;
        this.life--;
    }
    draw(ctx) {
        let size = Math.max(1, (this.life / this.m) * 4);
        ctx.fillStyle = this.c;
        ctx.fillRect(this.x, this.y, size, size);
    }
}

class Entity {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.active = true; this.state = 'NORMAL';
    }
    update() {
        if (!this.active) return;
        // logic falls
        let cx = Math.floor(this.x / CELL);
        let cy = Math.floor(this.y / CELL);
        if (cy < GH - 1 && grid[(cy + 1) * GW + cx] === TYPE_AIR) this.y += CELL;

        if (this.state === 'BURNING') {
            if (Math.random() < 0.2) particles.push(new Particle(this.x + (Math.random() - 0.5) * 10, this.y - 10, 0, -1, '#000', 20));
            this.life--;
            if (this.life <= 0) {
                this.active = false;
                if (this.type === 'TREE' || this.type === 'PINE_TREE' || this.type === 'CACTUS') {
                    this.turnToSand();
                }
            }
        }
    }
    turnToSand() {
        let sprite = [];
        if (this.type === 'TREE') {
            sprite = [
                "      1         ",
                "     11         ",
                "      1    1    ",
                "  11  1   11    ",
                "   1  1  1      ",
                "    1111        ",
                "      1  111    ",
                "   11 1         ",
                "      1    1    ",
                "      1  11     ",
                "      1         ",
                "      1         ",
                "      1         ",
                "      1         ",
                "     111        "
            ];
        } else if (this.type === 'PINE_TREE') {
            sprite = [
                "           1     ",
                "        1 11     ",
                "    1  11 11 1   ",
                "   111 11 11 11  ",
                "    11 11 1111   ",
                "     11 11111  1 ",
                "      11111   11 ",
                "  11  1111  111  ",
                "   111111 111    ",
                "     1111 11     ",
                "     1111        ",
                "     1111        ",
                "    111111       "
            ];
        } else if (this.type === 'CACTUS') {
            sprite = [
                "    111    ",
                "    111    ",
                " 11 111 11 ",
                " 11 111 11 ",
                " 111111111 ",
                "    111    ",
                "    111    ",
                "    111    "
            ];
        }
        if (sprite.length === 0) return;

        let sc = 3;
        if (this.type === 'CACTUS') sc = 4;
        let bx = -(sprite[0].length * sc) / 2;
        let by = -(sprite.length * sc);

        for (let r = 0; r < sprite.length; r++) {
            for (let c = 0; c < sprite[r].length; c++) {
                if (sprite[r][c] === '1') {
                    for (let n = 0; n < 4; n++) {
                        let px = this.x + bx + c * sc + Math.random() * sc;
                        let py = this.y + by + r * sc + Math.random() * sc;
                        physicsParticles.push(new PhysicsParticle(px, py, (Math.random() - 0.5) * 2, -1 - Math.random() * 2, TYPE_SAND));
                    }
                }
            }
        }
    }
    trigger() {
        if ((this.type === 'TREE' || this.type === 'PINE_TREE' || this.type === 'CACTUS') && this.state === 'NORMAL') { this.state = 'BURNING'; this.life = 100; }
        if (this.type === 'HOUSE' && this.active) { this.active = false; explodeAt(this.x, this.y, 80, true); }
    }
    draw(ctx) {
        if (!this.active) return;
        ctx.fillStyle = '#000';
        ctx.save(); ctx.translate(this.x, this.y);
        if (this.type === 'TREE') {
            // Bare branching pixel-art tree
            const sprite = [
                "      1         ",
                "     11         ",
                "      1    1    ",
                "  11  1   11    ",
                "   1  1  1      ",
                "    1111        ",
                "      1  111    ",
                "   11 1         ",
                "      1    1    ",
                "      1  11     ",
                "      1         ",
                "      1         ",
                "      1         ",
                "      1         ",
                "     111        "
            ];
            let sc = 3;
            let bx = -(sprite[0].length * sc) / 2;
            let by = -(sprite.length * sc);

            for (let r = 0; r < sprite.length; r++) {
                for (let c = 0; c < sprite[r].length; c++) {
                    if (sprite[r][c] === '1') {
                        ctx.fillStyle = (this.state === 'BURNING' && Math.random() < 0.3) ? '#f00' : '#000';
                        ctx.fillRect(bx + c * sc, by + r * sc, sc, sc);
                    }
                }
            }
        } else if (this.type === 'PINE_TREE') {
            const sprite = [
                "           1     ",
                "        1 11     ",
                "    1  11 11 1   ",
                "   111 11 11 11  ",
                "    11 11 1111   ",
                "     11 11111  1 ",
                "      11111   11 ",
                "  11  1111  111  ",
                "   111111 111    ",
                "     1111 11     ",
                "     1111        ",
                "     1111        ",
                "    111111       "
            ];
            let sc = 3; // Pixel scale multiplier
            let bx = -(sprite[0].length * sc) / 2;
            let by = -(sprite.length * sc);

            for (let r = 0; r < sprite.length; r++) {
                for (let c = 0; c < sprite[r].length; c++) {
                    if (sprite[r][c] === '1') {
                        ctx.fillStyle = (this.state === 'BURNING' && Math.random() < 0.3) ? '#f00' : '#000';
                        ctx.fillRect(bx + c * sc, by + r * sc, sc, sc);
                    }
                }
            }
        } else if (this.type === 'CACTUS') {
            const sprite = [
                "    111    ",
                "    111    ",
                " 11 111 11 ",
                " 11 111 11 ",
                " 111111111 ",
                "    111    ",
                "    111    ",
                "    111    "
            ];
            let sc = 4;
            let bx = -(sprite[0].length * sc) / 2;
            let by = -(sprite.length * sc);
            for (let r = 0; r < sprite.length; r++) {
                for (let c = 0; c < sprite[r].length; c++) {
                    if (sprite[r][c] === '1') {
                        ctx.fillStyle = (this.state === 'BURNING' && Math.random() < 0.3) ? '#f00' : '#000';
                        ctx.fillRect(bx + c * sc, by + r * sc, sc, sc);
                    }
                }
            }
        } else if (this.type === 'HOUSE') {
            ctx.fillRect(-20, -20, 40, 20);
            ctx.beginPath(); ctx.moveTo(-24, -20); ctx.lineTo(0, -35); ctx.lineTo(24, -20); ctx.fill();
        }
        ctx.restore();
    }
}

class Tornado {
    constructor(x, y) {
        this.x = x; this.y = y; this.active = true;
        // Move randomly left or right, regardless of start position
        this.vx = (Math.random() < 0.5) ? 1.5 : -1.5;
        this.life = 600;
    }
    update() {
        this.x += this.vx;
        this.life--;
        if (this.life <= 0 || this.x < 0 || this.x > canvas.width) this.active = false;

        // Find ground
        let cx = Math.floor(this.x / CELL);
        let groundY = GH - 1;
        for (let py = 0; py < GH; py++) { if (grid[py * GW + cx] !== TYPE_AIR) { groundY = py; break; } }
        this.y = groundY * CELL;

        // Suck up sand/earth and strip trees within tornado width (perim like meteor)
        let sweepR = 7; // ~28px total width
        for (let sx = cx - sweepR; sx <= cx + sweepR; sx++) {
            if (sx < 0 || sx >= GW) continue;
            // Find local surface
            let sy = -1;
            for (let py = 0; py < GH; py++) {
                if (grid[py * GW + sx] !== TYPE_AIR) {
                    sy = py;
                    break;
                }
            }
            if (sy === -1) continue;

            // Degrade tree pixels upward from surface
            for (let py = sy; py >= Math.max(0, sy - 8); py--) {
                if (grid[py * GW + sx] === TYPE_TREE || grid[py * GW + sx] === TYPE_WOOD || grid[py * GW + sx] === TYPE_LEAF) {
                    grid[py * GW + sx] = TYPE_SAND;
                    gridUpdated = true;
                    markActiveArea(sx * CELL, 1);
                }
            }

            // Morph surface: Top 10px DIRT -> SAND, Top 5px ROCK -> DIRT
            // Also delete 20% of affected SAND pixels
            let dirtMorphed = 0;
            let rockMorphed = 0;
            // Scan deep enough to find materials (e.g. 30 pixels down from surface)
            for (let py = sy; py < Math.min(GH, sy + 30); py++) {
                let idx = py * GW + sx;
                let type = grid[idx];

                if (type === TYPE_SAND) {
                    if (Math.random() < (DEBUG_CONFIG.tornadoSandDeletPct / 100)) {
                        grid[idx] = TYPE_AIR;
                        gridUpdated = true;
                    }
                } else if (type === TYPE_EARTH) {
                    let depth = DEBUG_CONFIG.tornadoDirtDepth;
                    let targetDepth = Math.floor(depth) + (Math.random() < (depth % 1) ? 1 : 0);
                    if (dirtMorphed < targetDepth) {
                        grid[idx] = TYPE_SAND;
                        dirtMorphed++;
                        gridUpdated = true;
                        markActiveArea(sx * CELL, 1);

                        // Throw sand into the air
                        if (Math.random() < 0.3) {
                            let vx = (Math.random() - 0.5) * 6;
                            let vy = -2 - Math.random() * 5;
                            physicsParticles.push(new PhysicsParticle(sx * CELL, py * CELL, vx, vy, TYPE_SAND));
                        }
                    }
                } else if (type === TYPE_ROCK) {
                    let depth = DEBUG_CONFIG.tornadoRockDepth;
                    let targetDepth = Math.floor(depth) + (Math.random() < (depth % 1) ? 1 : 0);
                    if (rockMorphed < targetDepth) {
                        grid[idx] = TYPE_EARTH;
                        rockMorphed++;
                        gridUpdated = true;
                        markActiveArea(sx * CELL, 1);
                    }
                }
            }
        }

        // Emit sand particles (dropping sand as it moves)
        if (Math.random() < 0.4) {
            let px = this.x + (Math.random() - 0.5) * 40;
            let py = this.y - 20 - Math.random() * 40;
            let vx = (Math.random() - 0.5) * 2;
            let vy = 1 + Math.random() * 3; // Falling down
            physicsParticles.push(new PhysicsParticle(px, py, vx, vy, TYPE_SAND));
        }

        for (let i = 0; i < 2; i++) particles.push(new Particle(this.x + (Math.random() - 0.5) * 30, this.y, (Math.random() - 0.5) * 2, -Math.random() * 4, '#000', 40));

        // push tanks
        tanks.forEach(t => {
            if (!t.alive) return;
            if (Math.abs(t.x - this.x) < 60) {
                t.takeDamage(0.35, null);
            }
        });
    }
    draw(ctx) {
        if (!this.active) return;
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let ry = this.y - i * 15;
            let rx = this.x + Math.sin(Date.now() * 0.01 + i) * 10;
            ctx.moveTo(rx - 10 - i * 2, ry); ctx.lineTo(rx + 10 + i * 2, ry);
        }
        ctx.stroke();
    }
}

class UFO {
    constructor() {
        this.x = Math.random() < 0.5 ? -100 : canvas.width + 100;
        // spawn lower (between 100 and 150 pixels from top) instead of (30 to 110)
        this.y = 100 + Math.random() * 50;
        // fly faster (2.5x speed)
        this.vx = (this.x < 0 ? 1 : -1) * (2.5 + Math.random());
        this.active = true;
        this.life = 600;
        this.fireTimer = Math.random() * 60;
    }
    update() {
        this.x += this.vx;
        this.y += Math.sin(Date.now() * 0.005) * 0.5;
        this.life--;
        // Don't despawn until fully off screen
        if (this.life <= 0 || this.x < -150 || this.x > canvas.width + 150) this.active = false;

        this.fireTimer--;
        if (this.fireTimer <= 0 && this.x > 0 && this.x < canvas.width) {
            this.fireTimer = 100 + Math.random() * 100;

            // RAYCAST DOWN
            let lx = this.x;
            let ly = GH * CELL; // Default to bottom
            let cx = Math.floor(lx / CELL);
            if (cx >= 0 && cx < GW) {
                for (let py = Math.floor(this.y / CELL); py < GH; py++) {
                    if (grid[py * GW + cx] !== TYPE_AIR && grid[py * GW + cx] !== TYPE_WATER) {
                        ly = py * CELL;
                        break;
                    }
                }
            }

            // VISUAL BEAM
            for (let y = this.y; y < ly; y += 8) {
                particles.push(new Particle(lx + (Math.random() - 0.5) * 4, y, 0, 0, '#f00', 15));
            }
            // IMPACT EFFECT
            carveGrid(lx, ly, 35, true);
            applyUFOImpact(lx, ly);
        }
    }
    draw(ctx) {
        if (!this.active) return;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(this.x, this.y, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(this.x, this.y - 4, 8, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fff'; // simple white lights
        for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(this.x - 10 + i * 10, this.y + 2, 2, 0, Math.PI * 2); ctx.fill();
        }
    }
}

class Sandstorm {
    constructor() {
        this.active = true;
        this.life = 600; // 10 seconds
        this.dir = Math.random() < 0.5 ? 1 : -1;
    }
    update() {
        this.life--;
        if (this.life <= 0) this.active = false;

        // Increase intensity (particles per frame)
        for (let i = 0; i < 15; i++) {
            let startX = this.dir === 1 ? -10 : canvas.width + 10;
            let startY = Math.random() * canvas.height;
            let vx = this.dir * (12 + Math.random() * 8); // faster
            let vy = (Math.random() - 0.5) * 3;
            physicsParticles.push(new PhysicsParticle(startX, startY, vx, vy, TYPE_SAND));
        }

        // Removed tank push as requested - players don't move
        // tanks.forEach(t => { ... });

        // Add visual wind effect
    }
    draw(ctx) {
        // Visuals are handled by the physics particles and global wind
    }
}

class LavaRiver {
    constructor() {
        this.y = GH * CELL;
        this.x = 50 + Math.random() * (canvas.width - 100);
        this.active = true;
        this.vx = 0;
    }
    update() {
        if (!this.active) return;

        for (let step = 0; step < 2; step++) {
            this.y -= Math.random() * 2 + 1; // move up
            this.x += this.vx;

            // Randomly change direction heavily
            if (Math.random() < 0.1) this.vx = (Math.random() - 0.5) * 8;

            // Clamp X
            if (this.x < 10) { this.x = 10; this.vx = Math.abs(this.vx); }
            if (this.x > canvas.width - 10) { this.x = canvas.width - 10; this.vx = -Math.abs(this.vx); }

            if (this.y < 0) {
                this.active = false;
                break;
            }

            let cx = Math.floor(this.x / CELL);
            let cy = Math.floor(this.y / CELL);
            let r = 2; // vein thickness
            let changed = false;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy <= r * r) {
                        let nx = cx + dx, ny = cy + dy;
                        if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
                            let idx = ny * GW + nx;
                            if (grid[idx] !== TYPE_AIR && grid[idx] !== TYPE_WATER) {
                                grid[idx] = TYPE_LAVA;
                                materialAge[idx] = 0;
                                changed = true;
                            }
                        }
                    }
                }
            }
            if (changed) {
                gridUpdated = true;
                markActiveArea(this.x, r * CELL);
                if (Math.random() < 0.3) {
                    physicsParticles.push(new PhysicsParticle(this.x + (Math.random() - 0.5) * 10, this.y, (Math.random() - 0.5) * 3, -3 - Math.random() * 2, TYPE_LAVA));
                }
                screenShake = 3;

                // Spawn a side branch occasionally
                if (Math.random() < 0.05) { // 5% chance per step
                    disasters.push(new LavaRiverBranch(this.x, this.y));
                }
            }

            tanks.forEach(t => {
                if (t.alive && Math.abs(t.x - this.x) < 25 && Math.abs(t.y - this.y) < 25) {
                    t.takeDamage(10, null);
                }
            });
        }
    }

    draw(ctx) { }
}

class LavaRiverBranch {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.active = true;
        this.life = 20 + Math.random() * 30; // Shorter life than main river
        // Move diagonally up and strongly to one side
        let dir = Math.random() < 0.5 ? 1 : -1;
        this.vx = dir * (2 + Math.random() * 4);
        this.vy = -(1 + Math.random() * 2);
    }
    update() {
        if (!this.active) return;

        this.life--;
        if (this.life <= 0) {
            this.active = false;
            return;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Add jaggy movement
        if (Math.random() < 0.2) this.vy += (Math.random() - 0.5) * 2;
        if (Math.random() < 0.2) this.vx += (Math.random() - 0.5) * 2;

        if (this.x < 10 || this.x > canvas.width - 10 || this.y < 0) {
            this.active = false;
            return;
        }

        let cx = Math.floor(this.x / CELL);
        let cy = Math.floor(this.y / CELL);
        let r = 1; // thinner than main river
        let changed = false;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy <= r * r) {
                    let nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
                        let idx = ny * GW + nx;
                        if (grid[idx] !== TYPE_AIR && grid[idx] !== TYPE_WATER) {
                            grid[idx] = TYPE_LAVA;
                            materialAge[idx] = 0;
                            changed = true;
                        }
                    }
                }
            }
        }

        if (changed) {
            gridUpdated = true;
            markActiveArea(this.x, r * CELL);
            if (Math.random() < 0.1) {
                physicsParticles.push(new PhysicsParticle(this.x + (Math.random() - 0.5) * 5, this.y, (Math.random() - 0.5) * 2, -1 - Math.random() * 2, TYPE_LAVA));
            }
        }

        tanks.forEach(t => {
            if (t.alive && Math.abs(t.x - this.x) < 15 && Math.abs(t.y - this.y) < 15) {
                t.takeDamage(5, null);
            }
        });
    }

    draw(ctx) { }
}

class Storm {
    constructor() {
        this.active = true;
        this.life = 600; // 10 seconds of rain
        this.particlesPushed = 0;
    }
    update() {
        if (!this.active) return;
        this.life--;
        if (this.life <= 0) {
            this.active = false;
            return;
        }

        // Pour heavy rain across the screen
        for (let i = 0; i < 20; i++) {
            let px = Math.random() * canvas.width;
            let py = -Math.random() * 50;
            // Falls almost straight down
            physicsParticles.push(new PhysicsParticle(px, py, (Math.random() - 0.5), Math.random() * 2 + 5, TYPE_WATER));
        }

        // Add visual background rain particles (fast falling white/blue lines)
        if (this.life % 2 === 0) {
            for (let i = 0; i < 5; i++) {
                particles.push(new Particle(Math.random() * canvas.width, -Math.random() * 100, Math.random() - 0.5, 10 + Math.random() * 10, '#88f', 10));
            }
        }
    }
    draw(ctx) { }
}

// Minimal render for map preview
function drawMapPreview() {
    if (!mapPreviewCanvas) return;
    let pCtx = mapPreviewCanvas.getContext('2d');
    pCtx.clearRect(0, 0, mapPreviewCanvas.width, mapPreviewCanvas.height);
    // Draw scaled down version of grid
    // Pre-generate map into grid temporally, then discard since game hasn't started
    pCtx.drawImage(terrainCanvas, 0, 0, GW, GH, 0, 0, mapPreviewCanvas.width, mapPreviewCanvas.height);
}



// We need an initial generate for the preview before start
setTimeout(() => {
    generateMap(true);
    drawMapPreview();
}, 200);

let disasters = [];

function explodeAt(x, y, r, includeAir) {
    sfx.playExplosion();
    for (let i = 0; i < r; i++) {
        particles.push(new Particle(x, y, (Math.random() - 0.5) * (r * 0.1), (Math.random() - 0.5) * (r * 0.1), '#000', 20 + Math.random() * 20));
    }
}

function applyUFOImpact(lx, ly) {
    sfx.playExplosion();
    // LAVA POOL (Small area at impact)
    let scx = Math.floor(lx / CELL);
    let scy = Math.floor(ly / CELL);
    let lr = 2; // lava radius
    for (let dy = -lr; dy <= lr; dy++) {
        for (let dx = -lr; dx <= lr; dx++) {
            if (dx * dx + dy * dy > lr * lr) continue; // Circular check
            let nx = scx + dx, ny = scy + dy;
            if (nx >= 0 && nx < GW && ny >= 0 && ny < GH && Math.random() < 0.7) {
                if (grid[ny * GW + nx] === TYPE_AIR || grid[ny * GW + nx] === TYPE_EARTH || grid[ny * GW + nx] === TYPE_SAND) {
                    grid[ny * GW + nx] = TYPE_LAVA;
                    materialAge[ny * GW + nx] = 0; // Reset aging for new lava
                }
            }
        }
    }
    gridUpdated = true;
    markActiveArea(lx, 40);

    // Damage players in beam
    tanks.forEach(t => {
        if (t.alive && Math.abs(t.x - lx) < 25 && t.y > ly - 50 && t.y < ly + 20) {
            t.takeDamage(30, null);
        }
    });
}

function generateTreeCells(type) {
    let cells = [];
    if (type === 'PINE_TREE') {
        let trunkH = 4 + Math.floor(Math.random() * 4);
        let coneH = 14 + Math.floor(Math.random() * 10);
        let maxW = 5 + Math.floor(Math.random() * 5);
        for (let y = 0; y < trunkH; y++) cells.push({ dx: 0, dy: -y, type: TYPE_WOOD }, { dx: 1, dy: -y, type: TYPE_WOOD });
        for (let row = 0; row < coneH; row++) {
            let progress = row / coneH;
            let w = Math.max(1, Math.floor(progress * maxW));
            for (let x = -w; x <= w; x++) {
                if (Math.random() < 0.92) cells.push({ dx: x, dy: -(trunkH + row), type: TYPE_LEAF });
            }
        }
    } else if (type === 'TREE') {
        let trunkH = 6 + Math.floor(Math.random() * 5);
        let crownRX = 6 + Math.floor(Math.random() * 5);
        let crownRY = 5 + Math.floor(Math.random() * 4);
        let crownCY = trunkH + Math.floor(crownRY * 0.9);
        for (let y = 0; y < trunkH; y++) cells.push({ dx: 0, dy: -y, type: TYPE_WOOD }, { dx: 1, dy: -y, type: TYPE_WOOD });
        for (let dy = -(crownRY + 3); dy <= crownRY + 3; dy++) {
            for (let dx = -(crownRX + 3); dx <= crownRX + 3; dx++) {
                let nx = dx / crownRX, ny = dy / crownRY;
                let dist = Math.sqrt(nx * nx + ny * ny);
                let edgeNoise = 0.85 + Math.sin(dx * 1.3 + dy * 0.8) * 0.15;
                if (dist <= edgeNoise && Math.random() < 0.88) {
                    cells.push({ dx, dy: -(crownCY + dy), type: TYPE_LEAF });
                }
            }
        }
    } else if (type === 'CACTUS') {
        let h = 8 + Math.floor(Math.random() * 6);
        // Main trunk
        for (let y = 0; y < h; y++) {
            cells.push({ dx: 0, dy: -y, type: TYPE_WOOD });
            cells.push({ dx: 1, dy: -y, type: TYPE_WOOD });
        }
        // Left arm
        let armLY = 3 + Math.floor(Math.random() * 2);
        let armLWidth = 2 + Math.floor(Math.random() * 2);
        for (let x = 1; x <= armLWidth; x++) cells.push({ dx: -x, dy: -armLY, type: TYPE_WOOD });
        for (let y = 1; y <= 3; y++) cells.push({ dx: -armLWidth, dy: -(armLY + y), type: TYPE_WOOD });

        // Right arm
        let armRY = 5 + Math.floor(Math.random() * 2);
        let armRWidth = 2 + Math.floor(Math.random() * 2);
        for (let x = 1; x <= armRWidth; x++) cells.push({ dx: 1 + x, dy: -armRY, type: TYPE_WOOD });
        for (let y = 1; y <= 3; y++) cells.push({ dx: 1 + armRWidth, dy: -(armRY + y), type: TYPE_WOOD });
    }
    return cells;
}

function generateMap(isPreview = false) {
    grid.fill(TYPE_AIR);
    staticEntities = [];

    console.log("Generating Advanced Map (Hills + Cellular Automata Caves)...");

    // 1. GENERATE SURFACE HEIGHTMAP (Multi-layered Sine Waves)
    let heights = new Int32Array(GW);
    for (let x = 0; x < GW; x++) {
        // Normalize x
        let nx = x / 150.0;
        // Combine low freq (mountains) + high freq (bumps)
        let h = Math.sin(nx) * 20 + Math.sin(nx * 3.5) * 10 + Math.sin(nx * 8) * 2;
        heights[x] = Math.floor(GH * 0.5 + h); // Average height at 50%
    }

    // 2. We no longer generate caves (bypassing caveMap logic)

    // 3. COMBINE & RENDER TO GAME GRID
    for (let x = 0; x < GW; x++) {
        for (let y = 0; y < GH; y++) {
            let idx = y * GW + x;

            // Surface layer and Underground are now 100% ROCK
            if (y >= heights[x]) {
                grid[idx] = TYPE_ROCK;
            }
        }
    }

    // 4. PRE-GENERATION EROSION (User requested 3 earthquakes)
    for (let i = 0; i < 3; i++) {
        applyEarthquake(15 + Math.floor(Math.random() * 10), true);
    }

    // 5. Vegetation (Only on valid surface)
    // 3x more trees: check every 4 pixels instead of 8, and increase probability
    for (let x = 0; x < GW; x += 4) {
        if (Math.random() > 0.3) continue;
        let y = heights[x];
        // Ensure we place tree on solid block (Earth or Rock)
        if (y < GH && (grid[y * GW + x] === TYPE_EARTH || grid[y * GW + x] === TYPE_ROCK)) {
            let r = Math.random();
            let type = 'TREE';
            if (r < 0.33) type = 'PINE_TREE';
            else if (r < 0.66) type = 'CACTUS';
            staticEntities.push(new Entity(x * CELL, (y - 1) * CELL, type));
        }
    }

    redrawTerrainCanvas();

    if (!isPreview) {
        // Start Game
        finalizeRoundStart();
        genPhase = 'OFF';
        gameState = 'AIMING';
        uiHud.classList.remove('hidden');
        updateHUD();
    }
}

function carveGrid(worldX, worldY, wRadius, destroysRock) {
    // Always ignite trees in radius
    staticEntities.forEach(ent => {
        if (ent.active && (ent.type === 'TREE' || ent.type === 'PINE_TREE' || ent.type === 'CACTUS')) {
            let dx = ent.x - worldX, dy = (ent.y - 30) - worldY;
            if (Math.sqrt(dx * dx + dy * dy) < wRadius + 30) {
                if (ent.state !== 'BURNING') {
                    ent.trigger();
                }
            }
        }
    });

    let cx = Math.floor(worldX / CELL);
    let cy = Math.floor(worldY / CELL);
    let r = Math.floor(wRadius / CELL);
    let changed = false;

    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            let distSq = dx * dx + dy * dy;
            if (distSq <= r * r) {
                let nx = cx + dx, ny = cy + dy;
                if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
                    let idx = ny * GW + nx;
                    let type = grid[idx];
                    let stepChanged = false;

                    // DEGRADATION LOGIC: Rock -> Dirt -> Sand -> Air
                    if (type === TYPE_WATER || type === TYPE_LAVA) {
                        let dist = Math.sqrt(distSq) || 1;
                        let nx = dx / dist;
                        let ny = dy / dist;
                        let speed = (r - dist) * 0.5 + Math.random() * 2;

                        // Splash effect
                        physicsParticles.push(new PhysicsParticle(worldX + dx * CELL, worldY + dy * CELL, nx * speed, ny * speed - 2, type));

                        grid[idx] = TYPE_AIR;
                        stepChanged = true;
                    } else if (type === TYPE_SAND || type === TYPE_EARTH) {
                        // All loose materials (Sand/Dirt) become flying SAND particles
                        let dist = Math.sqrt(distSq) || 1;
                        let nx = dx / dist;
                        let ny = dy / dist;
                        let speed = (r - dist) * 0.5 + Math.random() * 2;

                        // Always spawn as TYPE_SAND (Yellow) to satisfy "Hlina se vzdy zmeni na PISEK"
                        physicsParticles.push(new PhysicsParticle(worldX + dx * CELL, worldY + dy * CELL, nx * speed, ny * speed - 2, TYPE_SAND));

                        grid[idx] = TYPE_AIR;
                        stepChanged = true;
                    } else if (type === TYPE_ROCK) {
                        if (destroysRock) {
                            // Core of the explosion: Destroy to AIR for "crater" (15% radius)
                            if (distSq < (r * 0.15) * (r * 0.15)) {
                                grid[idx] = TYPE_AIR;
                            } else {
                                // Outer area: Morph to EARTH (Dirty Rock)
                                grid[idx] = TYPE_EARTH;
                            }
                            stepChanged = true;
                        }
                    } else if (type === TYPE_WOOD || type === TYPE_TREE) {
                        let dist = Math.sqrt(distSq) || 1;
                        let nx = dx / dist;
                        let ny = dy / dist;
                        let speed = (r - dist) * 0.5 + Math.random() * 2;

                        // Blast out flying sand
                        if (Math.random() < 0.5) {
                            physicsParticles.push(new PhysicsParticle(worldX + dx * CELL, worldY + dy * CELL, nx * speed, ny * speed - 2, TYPE_SAND));
                        }

                        // Turn actual block into falling sand instead of air
                        grid[idx] = TYPE_SAND;
                        stepChanged = true;
                    } else if (type === TYPE_LEAF) {
                        if (Math.random() < 0.2) {
                            physicsParticles.push(new PhysicsParticle(worldX + dx * CELL, worldY + dy * CELL, (Math.random() - 0.5) * 4, -2 - Math.random() * 2, TYPE_SAND));
                        }
                        grid[idx] = TYPE_AIR;
                        stepChanged = true;
                    }

                    if (stepChanged) {
                        changed = true;
                    }
                }
            }
        }
    }
    if (changed) {
        gridUpdated = true;
        markActiveArea(worldX, wRadius);
    }
}

function updatePhysicsGrid() {
    let changed = false;

    for (let x = 0; x < GW; x++) {
        if (activeCols[x] === 0) continue;

        // Decrement the active timer for this column
        activeCols[x] -= 1;

        let colChanged = false;
        // Process from BOTTOM to TOP to avoid "skipping" particles in one frame
        for (let y = GH - 2; y >= 0; y--) {
            let idx = y * GW + x;
            let me = grid[idx];
            // Earth and Wood and Rock are static - they do not fall by themselves
            if (me === TYPE_AIR || me === TYPE_ROCK || me === TYPE_WOOD) continue;

            // Globally slow down Lava so it drops and spreads uniformly slower
            if (me === TYPE_LAVA && physicsFrameCount % 3 !== 0) continue;

            // TOXIC WATER DECAY Logic
            if (me === TYPE_TOXIC_WATER) {
                materialAge[idx]++;
                if (materialAge[idx] > 600) { // 10 seconds
                    grid[idx] = TYPE_AIR;
                    changed = true;
                    continue;
                }
            }

            let below = idx + GW;

            // 0. WATER SPECIFIC DEDICATED LOGIC (User request: Sides first, then Down)
            if (me === TYPE_WATER) {
                let below = idx + GW;
                let canDown = (y < GH - 1 && grid[below] === TYPE_AIR);

                let targetIdx = -1;

                // Priority 1: ALWAYS go down if possible
                if (canDown) {
                    targetIdx = below;
                }
                // Priority 2: If no space down, check up to 2 pixels Left/Right
                else {
                    let L1 = (x > 0 && grid[idx - 1] === TYPE_AIR);
                    let L2 = (x > 1 && L1 && grid[idx - 2] === TYPE_AIR);
                    let R1 = (x < GW - 1 && grid[idx + 1] === TYPE_AIR);
                    let R2 = (x < GW - 2 && R1 && grid[idx + 2] === TYPE_AIR);

                    // If both directions have space, pick one randomly prioritizing distance
                    if (L1 && R1) {
                        let dir = (Math.random() < 0.5) ? -1 : 1;
                        if (dir === -1) targetIdx = L2 ? idx - 2 : idx - 1;
                        if (dir === 1) targetIdx = R2 ? idx + 2 : idx + 1;
                    } else if (L1) {
                        targetIdx = L2 ? idx - 2 : idx - 1;
                    } else if (R1) {
                        targetIdx = R2 ? idx + 2 : idx + 1;
                    }
                }

                if (targetIdx !== -1) {
                    grid[targetIdx] = me;
                    grid[idx] = TYPE_AIR;
                    materialAge[targetIdx] = materialAge[idx]; // Transfer age
                    colChanged = true;
                    changed = true;
                    // Wake up columns between start and target
                    let actMin = Math.min(x, targetIdx % GW);
                    let actMax = Math.max(x, targetIdx % GW);
                    for (let ax = Math.max(0, actMin - 1); ax <= Math.min(GW - 1, actMax + 1); ax++) {
                        activeCols[ax] = 120;
                    }
                }

                continue; // Skip the rest of the sand/lava/earth physics checks for this water pixel
            }

            // 0.5. TOXIC WATER Logic (Flows like Water)
            if (me === TYPE_TOXIC_WATER) {
                let below = idx + GW;
                let canDown = (y < GH - 1 && grid[below] === TYPE_AIR);
                let targetIdx = -1;
                if (canDown) targetIdx = below;
                else {
                    let L1 = (x > 0 && grid[idx - 1] === TYPE_AIR);
                    let L2 = (x > 1 && L1 && grid[idx - 2] === TYPE_AIR);
                    let R1 = (x < GW - 1 && grid[idx + 1] === TYPE_AIR);
                    let R2 = (x < GW - 2 && R1 && grid[idx + 2] === TYPE_AIR);
                    if (L1 && R1) {
                        let dir = (Math.random() < 0.5) ? -1 : 1;
                        if (dir === -1) targetIdx = L2 ? idx - 2 : idx - 1;
                        if (dir === 1) targetIdx = R2 ? idx + 2 : idx + 1;
                    } else if (L1) {
                        targetIdx = L2 ? idx - 2 : idx - 1;
                    } else if (R1) {
                        targetIdx = R2 ? idx + 2 : idx + 1;
                    }
                }
                if (targetIdx !== -1) {
                    grid[targetIdx] = me;
                    grid[idx] = TYPE_AIR;
                    materialAge[targetIdx] = materialAge[idx]; // Transfer age
                    colChanged = true;
                    changed = true;
                    let actMin = Math.min(x, targetIdx % GW);
                    let actMax = Math.max(x, targetIdx % GW);
                    for (let ax = Math.max(0, actMin - 1); ax <= Math.min(GW - 1, actMax + 1); ax++) activeCols[ax] = 120;
                }
                continue;
            }

            // 0.5. LAVA SPECIFIC DEDICATED LOGIC (Down first, then Sides - identical to Water)
            if (me === TYPE_LAVA) {
                // ALWAYS increment age
                materialAge[idx]++;
                let age = materialAge[idx];

                // Force column to stay active until lava hardens
                activeCols[x] = Math.max(activeCols[x], 2);

                let below = idx + GW;
                let canDown = (y < GH - 1 && grid[below] === TYPE_AIR);

                let targetIdx = -1;

                // Priority 1: ALWAYS go down if possible
                if (canDown) {
                    targetIdx = below;
                } else if (y < GH - 1 && grid[below] === TYPE_WATER) {
                    // Special interaction: Lava falling straight down onto water = delete water, lava cools
                    grid[below] = TYPE_ROCK;
                    grid[idx] = TYPE_AIR;
                    if (Math.random() < 0.2) {
                        physicsParticles.push(new PhysicsParticle(x * CELL, y * CELL, (Math.random() - 0.5) * 2, -2 - Math.random() * 2, TYPE_AIR));
                    }
                    colChanged = true;
                    changed = true;
                    activeCols[x] = 120;
                    continue;
                }

                // Priority 2: If no space down, check up to 2 pixels Left/Right
                if (targetIdx === -1) {
                    let L1 = (x > 0 && grid[idx - 1] === TYPE_AIR);
                    let L2 = (x > 1 && L1 && grid[idx - 2] === TYPE_AIR);
                    let R1 = (x < GW - 1 && grid[idx + 1] === TYPE_AIR);
                    let R2 = (x < GW - 2 && R1 && grid[idx + 2] === TYPE_AIR);

                    // If both directions have space, pick one randomly prioritizing distance
                    if (L1 && R1) {
                        let dir = (Math.random() < 0.5) ? -1 : 1;
                        if (dir === -1) targetIdx = L2 ? idx - 2 : idx - 1;
                        if (dir === 1) targetIdx = R2 ? idx + 2 : idx + 1;
                    } else if (L1) {
                        targetIdx = L2 ? idx - 2 : idx - 1;
                    } else if (R1) {
                        targetIdx = R2 ? idx + 2 : idx + 1;
                    }
                }

                if (targetIdx !== -1) {
                    grid[targetIdx] = me;
                    grid[idx] = TYPE_AIR;
                    materialAge[targetIdx] = age; // Transfer age
                    materialAge[idx] = 0;
                    colChanged = true;
                    changed = true;
                    // Wake up columns between start and target
                    let actMin = Math.min(x, targetIdx % GW);
                    let actMax = Math.max(x, targetIdx % GW);
                    for (let ax = Math.max(0, actMin - 1); ax <= Math.min(GW - 1, actMax + 1); ax++) {
                        activeCols[ax] = 120;
                    }
                } else {
                    // HARDENING LOGIC (Lava always transforms to ROCK eventually)
                    let willHarden = false;
                    // stationary lava cools faster
                    if (age > 600) { // ~10 seconds stationary
                        willHarden = true;
                    } else if (age > 240 && Math.random() < 0.02) { // 4 second chance
                        willHarden = true;
                    }

                    if (willHarden) {
                        grid[idx] = TYPE_ROCK;
                        materialAge[idx] = 0;
                        colChanged = true;
                        changed = true;
                        if (x > 0) activeCols[x - 1] = 120;
                        if (x < GW - 1) activeCols[x + 1] = 120;
                    }
                }

                // Tree Ignition Logic
                if (physicsFrameCount % 10 === 0) { // Optimize: only check every 10 frames
                    let lx = x;
                    let ly = y;
                    let r = 2; // radius to check for trees
                    for (let dy = -r; dy <= r; dy++) {
                        for (let dx = -r; dx <= r; dx++) {
                            let checkX = lx + dx;
                            let checkY = ly + dy;
                            if (checkX >= 0 && checkX < GW && checkY >= 0 && checkY < GH) {
                                let cType = grid[checkY * GW + checkX];
                                if (cType === TYPE_WOOD || cType === TYPE_LEAF || cType === TYPE_TREE) {
                                    // Ignite any nearby trees
                                    staticEntities.forEach(ent => {
                                        if (ent.active && (ent.type === 'TREE' || ent.type === 'PINE_TREE' || ent.type === 'CACTUS')) {
                                            // Check distance to the entity root
                                            let tdist = Math.abs(ent.x - lx * CELL) + Math.abs((ent.y - 30) - ly * CELL);
                                            if (tdist < 80 && ent.state === 'NORMAL') {
                                                ent.trigger();
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    }
                }

                continue; // Skip the rest
            }

            // 1. STRAIGHT FALL (For all other falling materials)
            if (grid[below] === TYPE_AIR || grid[below] === TYPE_WATER) {
                // If the pixel below is TYPE_WATER, we only fall if we are denser (SAND, EARTH, ROCK, LAVA)
                let canFallIntoWater = false;
                if (grid[below] === TYPE_WATER) {
                    if (me === TYPE_SAND || me === TYPE_EARTH || me === TYPE_ROCK || me === TYPE_LAVA) {
                        canFallIntoWater = true;
                    }
                } else {
                    canFallIntoWater = true; // Air is always fine
                }

                if (canFallIntoWater) {
                    let typeBelow = grid[below];
                    if (typeBelow === TYPE_WATER && me === TYPE_LAVA) {
                        // Special interaction: Lava falling straight down onto water = delete water, lava cools
                        grid[below] = TYPE_ROCK;
                        grid[idx] = TYPE_AIR;
                        if (Math.random() < 0.2) {
                            physicsParticles.push(new PhysicsParticle(x * CELL, y * CELL, (Math.random() - 0.5) * 2, -2 - Math.random() * 2, TYPE_AIR));
                        }
                    } else {
                        // Swap with air or swap with water (density)
                        grid[below] = me;
                        grid[idx] = typeBelow;

                        if (me === TYPE_LAVA) {
                            materialAge[below] = materialAge[idx];
                            materialAge[idx] = 0;
                        }
                    }
                    colChanged = true;
                    changed = true;
                    // Keep this col and neighbors active (only if fluid-like)
                    activeCols[x] = 120; // Refresh timer
                    if (me === TYPE_SAND || me === TYPE_WATER || me === TYPE_LAVA || me === TYPE_LEAF) {
                        if (x > 0 && activeCols[x - 1] === 0) activeCols[x - 1] = 120;
                        if (x < GW - 1 && activeCols[x + 1] === 0) activeCols[x + 1] = 120;
                    }
                }
            }
            // 2. SLIDING (Sand: 45 deg, Earth/Wood: 80 deg)
            else {
                let leftBelow = below - 1;
                let rightBelow = below + 1;

                // Allow sliding into water if denser
                let canL = (x > 0 && (grid[leftBelow] === TYPE_AIR || (grid[leftBelow] === TYPE_WATER && (me === TYPE_SAND || me === TYPE_EARTH))));
                let canR = (x < GW - 1 && (grid[rightBelow] === TYPE_AIR || (grid[rightBelow] === TYPE_WATER && (me === TYPE_SAND || me === TYPE_EARTH))));

                if (me === TYPE_SAND || me === TYPE_LEAF || me === TYPE_EARTH) {
                    // Sand/Leaf slide at 45 deg consistently
                    // Earth (Dirt) slides "slightly" (15% chance) to maintain steep columns
                    let slideChance = (me === TYPE_EARTH) ? 0.15 : 1.0;

                    if (Math.random() < slideChance) {
                        if (canL && canR) {
                            let target = (Math.random() < 0.5) ? leftBelow : rightBelow;
                            let swapType = grid[target];
                            grid[target] = me; grid[idx] = swapType;
                            colChanged = true; changed = true;
                            activeCols[x] = 120; if (x > 0) activeCols[x - 1] = 120; if (x < GW - 1) activeCols[x + 1] = 120;
                        } else if (canL) {
                            let swapType = grid[leftBelow];
                            grid[leftBelow] = me; grid[idx] = swapType;
                            colChanged = true; changed = true;
                            activeCols[x] = 120; if (x > 0) activeCols[x - 1] = 120;
                        } else if (canR) {
                            let swapType = grid[rightBelow];
                            grid[rightBelow] = me; grid[idx] = swapType;
                            colChanged = true; changed = true;
                            activeCols[x] = 120; if (x < GW - 1) activeCols[x + 1] = 120;
                        }
                    }
                }

                // 3. FLUID BEHAVIOR (Slide sideways if we can't fall or slide diagonal)
                if (!changed && (me === TYPE_LAVA || me === TYPE_WATER)) {
                    // Both Water and Lava flow whenever they are processed
                    let shouldFlow = true;

                    if (shouldFlow) {
                        let targetIdx = -1;

                        // Simple Horizontal Leveling Logic (Lava & Water)
                        let L1 = (x > 0 && grid[idx - 1] === TYPE_AIR);
                        let L2 = (x > 1 && L1 && grid[idx - 2] === TYPE_AIR);
                        let R1 = (x < GW - 1 && grid[idx + 1] === TYPE_AIR);
                        let R2 = (x < GW - 2 && R1 && grid[idx + 2] === TYPE_AIR);

                        if (L1 && R1) {
                            let dir = (Math.random() < 0.5) ? -1 : 1;
                            if (dir === -1) targetIdx = L2 ? idx - 2 : idx - 1;
                            if (dir === 1) targetIdx = R2 ? idx + 2 : idx + 1;
                        } else if (L1) {
                            targetIdx = L2 ? idx - 2 : idx - 1;
                        } else if (R1) {
                            targetIdx = R2 ? idx + 2 : idx + 1;
                        }

                        if (targetIdx !== -1) {
                            grid[targetIdx] = me;
                            grid[idx] = TYPE_AIR;
                            if (me === TYPE_LAVA) { materialAge[targetIdx] = materialAge[idx]; materialAge[idx] = 0; }
                            colChanged = true; changed = true;
                            // Wake up columns between start and target
                            let actMin = Math.min(x, targetIdx % GW);
                            let actMax = Math.max(x, targetIdx % GW);
                            for (let ax = Math.max(0, actMin - 1); ax <= Math.min(GW - 1, actMax + 1); ax++) {
                                activeCols[ax] = 120;
                            }
                        }
                    }
                } // CLOSE shouldFlow

                // Water specific interactions
                if (me === TYPE_WATER) {
                    // Check for Lava touching water
                    let touchingLava = false;
                    if (y < GH - 1 && grid[idx + GW] === TYPE_LAVA) touchingLava = true;
                    else if (y > 0 && grid[idx - GW] === TYPE_LAVA) touchingLava = true;
                    else if (x > 0 && grid[idx - 1] === TYPE_LAVA) touchingLava = true;
                    else if (x < GW - 1 && grid[idx + 1] === TYPE_LAVA) touchingLava = true;

                    if (touchingLava) {
                        grid[idx] = TYPE_AIR; // Water evaporates
                        // Cool adjacent lava to rock
                        if (y < GH - 1 && grid[idx + GW] === TYPE_LAVA) grid[idx + GW] = TYPE_ROCK;
                        if (y > 0 && grid[idx - GW] === TYPE_LAVA) grid[idx - GW] = TYPE_ROCK;
                        if (x > 0 && grid[idx - 1] === TYPE_LAVA) grid[idx - 1] = TYPE_ROCK;
                        if (x < GW - 1 && grid[idx + 1] === TYPE_LAVA) grid[idx + 1] = TYPE_ROCK;

                        colChanged = true; changed = true;

                        // Visual steam
                        if (Math.random() < 0.2) {
                            physicsParticles.push(new PhysicsParticle(x * CELL, y * CELL, (Math.random() - 0.5) * 2, -2 - Math.random() * 2, TYPE_AIR));
                        }
                        continue; // Skip further water logic this frame
                    }
                }


            }
        }
    }
    if (changed) {
        gridUpdated = true;
    }

    // Tank damage/interaction
    tanks.forEach(t => {
        if (!t.alive) return;
        let tcx = Math.floor(t.x / CELL);
        let tcy = Math.floor(t.y / CELL);

        // Scan bounding box for contact with grid-based LAVA
        // Tank is approx 34px wide and 16px high
        let hw = 4; // 16 pixels each side
        let hh = 4; // 16 pixels high
        for (let dy = -hh; dy <= 0; dy++) {
            for (let dx = -hw; dx <= hw; dx++) {
                let nx = tcx + dx, ny = tcy + dy;
                if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
                    let idx = ny * GW + nx;
                    if (grid[idx] === TYPE_LAVA) {
                        t.takeDamage(1, null);
                        grid[idx] = TYPE_SAND;
                        materialAge[idx] = 0;
                        changed = true;
                    }
                }
            }
        }
    });

    physicsFrameCount++;
    if (changed) gridUpdated = true;
    return changed;
}




function redrawTerrainCanvas() {
    let imgData = tCtx.createImageData(GW, GH);
    let data = imgData.data;
    for (let i = 0; i < grid.length; i++) {
        let v = grid[i], p = i * 4;
        if (v === TYPE_SAND) {
            // Yellow (Sand)
            data[p] = 242; data[p + 1] = 210; data[p + 2] = 107; data[p + 3] = 255;
        } else if (v === TYPE_EARTH) {
            // Brown (Dirt)
            data[p] = 101; data[p + 1] = 67; data[p + 2] = 33; data[p + 3] = 255;
        } else if (v === TYPE_ROCK) {
            // Dark Gray (Rock)
            data[p] = 20; data[p + 1] = 20; data[p + 2] = 20; data[p + 3] = 255;
        } else if (v === TYPE_LAVA) {
            data[p] = 255; data[p + 1] = (i % 2 === 0) ? 60 : 0; data[p + 2] = 0; data[p + 3] = 255;
        } else if (v === TYPE_WATER) {
            data[p] = 50; data[p + 1] = 100; data[p + 2] = 255; data[p + 3] = 180;
        } else if (v === TYPE_TREE || v === TYPE_WOOD || v === TYPE_LEAF) {
            // Brown for wood, Dark Grey for leaves
            if (v === TYPE_WOOD) {
                data[p] = 101; data[p + 1] = 67; data[p + 2] = 33; data[p + 3] = 255;
            } else if (v === TYPE_LEAF) {
                data[p] = 34; data[p + 1] = 139; data[p + 2] = 34; data[p + 3] = 255;
            } else if (v === TYPE_TOXIC_WATER) {
                data[p] = 50; data[p + 1] = 205; data[p + 2] = 50; data[p + 3] = 255; // Lime Green
            } else {
                let g = (i % 2 === 0) ? 120 : 140;
                data[p] = g; data[p + 1] = g; data[p + 2] = g; data[p + 3] = 255;
            }
        } else {
            data[p + 3] = 0;
        }
    }
    tCtx.putImageData(imgData, 0, 0);
    gridUpdated = false;
    drawMapPreview();
}

// Gameloop specific 
function startGame() {
    resizeInit(); // Force update dimensions before start
    if (GW <= 0 || GH <= 0) {
        alert("Game Init Error: Window size too small!");
        return;
    }

    tanks = [];
    for (let i = 0; i < pCount; i++) tanks.push(new Tank(i, false));
    for (let i = 0; i < bCount; i++) tanks.push(new Tank(pCount + i, true));

    uiMenu.classList.add('hidden');
    uiHud.classList.add('hidden');
    openShop();
}

function startRound() {
    console.log("Starting round...");
    // 1. Hide UI immediately
    uiShop.classList.add('hidden');
    uiSummary.classList.add('hidden');

    // 2. Render logic with slight delay to allow UI to update
    setTimeout(() => {
        try {
            generateMap();
            projectiles = [];
            particles = [];
            disasters = [];
            playersTurned = 0;
            currentPlayerIndex = 0;
            uiHud.classList.remove('hidden');
            let hints = document.getElementById('remote-hints-hud');
            if (hints) {
                hints.classList.remove('hidden');
                setTimeout(() => hints.classList.add('hidden'), 8000);
            }
            console.log("Round started successfully.");
        } catch (e) {
            console.error("Critical error starting round:", e);
            alert("Error starting round: " + e.message);
        }
    }, 50);
}

function finalizeRoundStart() {
    tanks.forEach(t => t.spawn());
    renderHealthBars();

    // Random Surprise Gift
    if (tanks.length > 0) {
        let aliveTanks = tanks.filter(t => t.alive);
        if (aliveTanks.length > 0) {
            let surpriseTank = aliveTanks[Math.floor(Math.random() * aliveTanks.length)];
            let surpriseText = "";
            let rSurprise = Math.random();
            if (rSurprise < 0.33) {
                surpriseTank.hp += 100; // Overheal
                surpriseText = `${surpriseTank.name} Got EXTRA HEALTH!`;
            } else if (rSurprise < 0.66) {
                surpriseTank.fuel += 2000;
                surpriseText = `${surpriseTank.name} Got EXTRA FUEL!`;
            } else {
                // Random Shop Item
                let pool = WEAPONS.slice(1).concat(ITEMS.map(it => ({ ...it, isItem: true })));
                let randItem = pool[Math.floor(Math.random() * pool.length)];
                surpriseTank.inventory.push(randItem);
                surpriseText = `${surpriseTank.name} Got ${randItem.name}!`;
            }

            if (disasterAlert && disasterAlert.firstElementChild) {
                disasterAlert.firstElementChild.innerHTML = "SURPRISE!<br><span style='font-size: 1.5rem; color: #d00; display: block; margin-top: 10px;'>" + surpriseText + "</span>";
                disasterAlert.firstElementChild.style.fontSize = "3rem";
                disasterAlert.classList.remove('hidden');
                setTimeout(() => {
                    disasterAlert.classList.add('hidden');
                    disasterAlert.firstElementChild.style.fontSize = "5rem"; // reset back for disasters
                    disasterAlert.firstElementChild.innerHTML = ""; // clean up
                }, 3000);
            }
        }
    }

    genPhaseTimer = 60; // Wait at least 1 second while they fall
}

function passTurn() {
    let aliveCount = tanks.filter(t => t.alive).length;
    if (aliveCount <= 1) {
        let winner = tanks.find(t => t.alive);
        if (winner) winner.money += 300; // Win bonus
        endRound(winner);
        return;
    }

    if (gameState !== 'DISASTER') {
        playersTurned++;
        if (playersTurned >= aliveCount) {
            playersTurned = 0;
            triggerDisaster();
            gameState = 'DISASTER';
            // ALWAYS ZOOM OUT ON DISASTER
            targetCamZoom = 1.0;
            targetCamX = 0;
            targetCamY = 0;
            return;
        }
    }

    // Wind disabled
    advancePlayerIndex();
}

function advancePlayerIndex() {
    // Apply end of turn water damage to ALL tanks in water
    tanks.forEach(t => {
        if (t.alive && t.wasInWater) {
            t.takeDamage(1, null);
        }
    });

    let previousPlayer = tanks[currentPlayerIndex];

    // Reset wasInWater for everyone at turn change
    tanks.forEach(t => t.wasInWater = false);

    let attempts = 0;
    do {
        currentPlayerIndex = (currentPlayerIndex + 1) % tanks.length;
        attempts++;
        if (attempts > tanks.length * 2) {
            console.error("Critical Error: Infinite loop in advancePlayerIndex. No alive players found?");
            // Force end round to avoid freeze
            endRound(null);
            return;
        }
    } while (!tanks[currentPlayerIndex].alive);

    tanks[currentPlayerIndex].actionMode = 'AIMING';
    tanks[currentPlayerIndex].moveTargetX = null;
    gameState = 'AIMING';
    updateHUD();
    // Reset turn timer
    turnTimer = TURN_TIME_LIMIT;
    if (turnTimerUI) {
        turnTimerUI.classList.remove('hidden');
        turnTimerUI.style.color = '#fff';
    }

    let t = tanks[currentPlayerIndex];

    // Zoom in 2x centered on player
    targetCamZoom = 2.0;
    let baseScale = window.innerWidth / 1920;
    let targetTotalScale = baseScale * targetCamZoom;

    // Center player in the middle of current viewport width/height
    let viewW = window.innerWidth / targetTotalScale;
    let viewH = window.innerHeight / targetTotalScale;
    targetCamX = t.x - viewW / 2;
    targetCamY = (t.y - 40) - viewH / 2; // Offset slightly up to center the tank chassis better

    if (tanks[currentPlayerIndex].isBot) setTimeout(() => playBotTurn(), 500);
}

function playBotTurn() {
    let t = tanks[currentPlayerIndex];
    if (!t || !t.alive || !t.isBot || gameState !== 'AIMING') return;

    let targets = tanks.filter(target => target.alive && target !== t);
    if (targets.length > 0) {
        let target = targets[Math.floor(Math.random() * targets.length)];
        let dx = target.x - t.x;
        let dy = (target.y - 10) - (t.y - 10);

        // Learning Logic: Accuracy improves over first 6 shots
        let baseError = Math.max(0, 0.3 - (t.shotsFired * 0.05));
        let basePowerError = Math.max(0, 15 - (t.shotsFired * 2.5));

        t.angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * baseError;
        let dist = Math.sqrt(dx * dx + dy * dy);
        t.power = Math.min(100, Math.max(10, (dist / 12) + (Math.random() - 0.5) * basePowerError));
    } else {
        t.angle = Math.random() * Math.PI;
        t.power = 30;
    }

    if (t.inventory.length > 1 && Math.random() < 0.5) {
        t.weaponIndex = Math.floor(Math.random() * t.inventory.length);
    }
    updateHUD();

    setTimeout(() => {
        let tk = tanks[currentPlayerIndex];
        if (tk !== t || gameState !== 'AIMING' || !tk.alive) return;
        let eq = tk.inventory[tk.weaponIndex];
        if (eq && eq.isItem && eq.special !== 'TELEPORT') {
            eq.apply(tk);
            let currentId = eq.id;
            tk.inventory.splice(tk.weaponIndex, 1);
            let nextIdx = tk.inventory.findIndex(i => i.id === currentId);
            if (nextIdx !== -1) tk.weaponIndex = nextIdx;
            else tk.weaponIndex = 0;
            updateHUD();
            sfx.playTurn();
            passTurn();
        } else {
            sfx.playShoot();
            fireProjectile();
        }
    }, 1000);
}

function endRound(winner) {
    gameState = 'ROUND_OVER';
    uiHud.classList.add('hidden');
    document.getElementById('winner-text').innerText = winner ? `${winner.name} Wins!` : 'Draw!';
    document.getElementById('leaderboard').innerHTML = tanks.map(t => `<div>${t.name} - $$$: ${t.money}</div>`).join('');
    uiSummary.classList.remove('hidden');
    document.getElementById('to-shop-btn').onclick = openShop;
}

function applyEarthquake(numBlobs = 10, isSilent = false) {
    if (!isSilent) {
        screenShake = 40;
        globalCollapse = 60;
    }
    // Fractal blob earthquake: organic cavity blobs + degradation rings
    for (let b = 0; b < numBlobs; b++) {
        let bx = Math.floor(Math.random() * GW);
        let by = Math.floor(GH * 0.2 + Math.random() * GH * 0.7);
        let br = 4 + Math.floor(Math.random() * 16); // core radius 4-19
        // Prebake angular noise phases for organic shape
        let ph1 = Math.random() * 6.28, ph2 = Math.random() * 6.28, ph3 = Math.random() * 6.28;
        let scan = br + 6;
        for (let dy = -scan; dy <= scan; dy++) {
            for (let dx = -scan; dx <= scan; dx++) {
                let nx = bx + dx, ny = by + dy;
                if (nx < 0 || nx >= GW || ny < 0 || ny >= GH) continue;

                let dist = Math.sqrt(dx * dx + dy * dy);
                let cur = grid[ny * GW + nx];
                if (cur === TYPE_AIR || cur === TYPE_WATER || cur === TYPE_LAVA) continue;
                // Angular fractal radius
                let ang = Math.atan2(dy, dx);
                let noiseR = br * (0.6 + 0.22 * Math.sin(ang * 3 + ph1) + 0.14 * Math.sin(ang * 5 + ph2) + 0.06 * Math.sin(ang * 9 + ph3));

                let changedThisPixel = false;
                if (dist <= noiseR) {
                    // Core: dig cavity
                    grid[ny * GW + nx] = TYPE_AIR;
                    changedThisPixel = true;
                } else if (dist <= noiseR + 3) {
                    // Inner ring: rock→earth, earth→sand, tree→sand
                    if (cur === TYPE_ROCK) { grid[ny * GW + nx] = TYPE_EARTH; changedThisPixel = true; }
                    else if (cur === TYPE_EARTH) { grid[ny * GW + nx] = TYPE_SAND; changedThisPixel = true; }
                    else if (cur === TYPE_TREE || cur === TYPE_WOOD || cur === TYPE_LEAF) { grid[ny * GW + nx] = TYPE_SAND; changedThisPixel = true; }
                } else if (dist <= noiseR + 6) {
                    // Outer ring: rock→earth only
                    if (cur === TYPE_ROCK && Math.random() < 0.5) { grid[ny * GW + nx] = TYPE_EARTH; changedThisPixel = true; }
                    else if (cur === TYPE_EARTH && Math.random() < 0.3) { grid[ny * GW + nx] = TYPE_SAND; changedThisPixel = true; }
                }

                if (changedThisPixel) {
                    markActiveArea(nx * CELL, 5);
                }
            }
        }
    }
    gridUpdated = true;
}

function triggerDisaster() {
    // Zoom out to show the full map width during a disaster
    targetCamZoom = 1.0;
    targetCamX = 0;
    targetCamY = 0;

    let r = Math.random();
    let dEvent;
    if (r < 0.15) {
        dEvent = "EARTHQUAKE!";
        applyEarthquake(10 + Math.floor(Math.random() * 10), false);
    } else if (r < 0.30) {
        dEvent = "METEOR SHOWER!";
        // Spawn lava rocks from the sky
        let meteorWpn = { name: 'Meteor', damage: 30, radius: 25, count: 1, speed: 1.0, spread: 0, cost: 0, destroysRock: true, special: 'LAVA_ROCK_SMALL' };
        for (let i = 0; i < 15; i++) {
            projectiles.push(new Projectile(Math.random() * canvas.width, -100 - Math.random() * 400, (Math.random() - 0.5) * 4, 10 + Math.random() * 5, meteorWpn, null));
        }
    } else if (r < 0.45) {
        dEvent = "LIGHTNING STORM!";
        let hitCount = Math.floor(Math.random() * 4) + 5; // 5 to 8 hits
        for (let i = 0; i < hitCount; i++) {
            setTimeout(() => {
                let lx = Math.random() * canvas.width;
                // 1) Find surface
                let ly = canvas.height - 10;
                let cx = Math.floor(lx / CELL);
                for (let py = 0; py < GH; py++) {
                    if (grid[py * GW + cx] !== TYPE_AIR) {
                        ly = py * CELL; break;
                    }
                }

                // 2) Generate a fractal lightning structure
                let bolts = [];
                function buildBolt(startX, startY, endY, segments, spread, isMain) {
                    let pts = [{ x: startX, y: startY }];
                    let curY = startY, curX = startX;
                    let segH = (endY - startY) / segments;
                    for (let s = 1; s <= segments; s++) {
                        let ny = startY + s * segH;
                        // Add some jaggedness
                        let nx = curX + (Math.random() - 0.5) * spread;
                        pts.push({ x: nx, y: ny });
                        curX = nx;
                        curY = ny;

                        // Branching
                        if (isMain && Math.random() < 0.25 && s < segments - 1) {
                            let branchLen = (endY - ny) * (0.3 + Math.random() * 0.4);
                            let branchXDir = (Math.random() < 0.5 ? -1 : 1);
                            let endBranchX = nx + branchXDir * (30 + Math.random() * 40);
                            let endBranchY = ny + branchLen;
                            buildBolt(nx, ny, endBranchY, Math.floor(segments / 2), spread * 1.5, false);
                        }
                    }
                    bolts.push({ pts, isMain });
                    return pts[pts.length - 1]; // return end tip
                }

                let actualEnd = buildBolt(lx, -10, ly, 15, 25, true);

                // 3) Create a temporary disaster visual object to hold the lightning on screen for ~400ms (25 frames)
                disasters.push({
                    active: true,
                    life: 25,
                    update: function () {
                        this.life--;
                        if (this.life <= 0) this.active = false;
                    },
                    draw: function (ctx) {
                        ctx.save();
                        // Flickering effect
                        if (Math.random() < 0.2) return;

                        // Draw branches first (thinner), then main trunk
                        for (let b of bolts) {
                            ctx.beginPath();
                            ctx.moveTo(b.pts[0].x, b.pts[0].y);
                            for (let p = 1; p < b.pts.length; p++) {
                                ctx.lineTo(b.pts[p].x, b.pts[p].y);
                            }
                            ctx.strokeStyle = '#000'; // Black lightning
                            ctx.lineWidth = b.isMain ? 4 : 2;
                            ctx.lineJoin = 'miter';
                            ctx.stroke();

                            // subtle white core
                            if (b.isMain) {
                                ctx.strokeStyle = '#fff';
                                ctx.lineWidth = 1;
                                ctx.stroke();
                            }
                        }
                        ctx.restore();
                    }
                });

                // End of bolt coords
                let impactX = actualEnd.x;
                let impactY = actualEnd.y;

                // Rest of logical impact
                explodeAt(impactX, impactY, 25, true);
                carveGrid(impactX, impactY, 25, false); // Blasts crater, sends splashes
                applyUFOImpact(impactX, impactY); // Creates lava pool and shock damage
                screenShake = 20;

                // ignite nearby trees and turn to sand
                staticEntities.forEach(ent => {
                    if (ent.active && (ent.type === 'TREE' || ent.type === 'PINE_TREE' || ent.type === 'CACTUS') && Math.abs(ent.x - impactX) < 80) {
                        ent.trigger(); // Starts burning
                        // Force turn to sand after a delay
                        setTimeout(() => {
                            if (ent.active && ent.state === 'BURNING') {
                                ent.active = false;
                                carveGrid(ent.x, ent.y - 30, 40, false); // "Destroy" tree radius
                                // Spawn sand
                                for (let s = 0; s < 15; s++) {
                                    physicsParticles.push(new PhysicsParticle(ent.x + (Math.random() - 0.5) * 20, ent.y - 30 + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 4, -2 - Math.random() * 4, TYPE_SAND));
                                }
                            }
                        }, 2000); // 2 seconds to burn before turning to sand
                    }
                });

                // hurt nearby tanks
                tanks.forEach(t => {
                    if (t.alive && Math.abs(t.x - impactX) < 60) t.takeDamage(15, null);
                });

            }, i * 300);
        }
    } else if (r < 0.60) {
        dEvent = "VOLCANIC ERUPTION!"; screenShake = 30;
        // Find a peak
        let bestY = GH, bestX = GW / 2;
        for (let x = 10; x < GW - 10; x += 10) {
            for (let y = 0; y < GH; y++) {
                if (grid[y * GW + x] !== TYPE_AIR) {
                    if (y < bestY && Math.random() < 0.3) { bestY = y; bestX = x; }
                    break;
                }
            }
        }

        let wx = bestX * CELL, wy = bestY * CELL;
        explodeAt(wx, wy, 150, true); // blow top off
        carveGrid(wx, wy, 80, true);
        applyUFOImpact(wx, wy); // Create lava pool and shock damage from the initial burst

        // Volcanic eruption: emit irregular black rocks with lava trails
        let vRock = { name: 'Volcanic Rock', damage: 40, radius: 25, count: 1, speed: 1.0, spread: 0, cost: 0, destroysRock: true, special: 'MELT_TO_LAVA' };
        for (let i = 0; i < 12; i++) {
            let vx = (Math.random() - 0.5) * 12;
            let vy = -12 - Math.random() * 10;
            projectiles.push(new Projectile(wx, wy, vx, vy, vRock, null));
        }

        // Also emit some loose lava splash
        for (let i = 0; i < 20; i++) {
            let vx = (Math.random() - 0.5) * 15;
            let vy = -10 - Math.random() * 15;
            physicsParticles.push(new PhysicsParticle(wx, wy, vx, vy, TYPE_LAVA));
        }

        gridUpdated = true;
    } else if (r < 0.70) {
        dEvent = "TORNADO!";
        disasters.push(new Tornado(Math.random() * canvas.width, GH / 2));
    } else if (r < 0.80) {
        dEvent = "SANDSTORM!";
        disasters.push(new Sandstorm());
    } else if (r < 0.87) {
        dEvent = "LAVA RIVER!";
        disasters.push(new LavaRiver());
    } else if (r < 0.94) {
        dEvent = "STORM!";
        disasters.push(new Storm());
    } else {
        dEvent = "ALIEN INVASION!";
        let count = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < count; i++) {
            setTimeout(() => disasters.push(new UFO()), i * 600);
        }
    }

    disasterAlert.firstElementChild.innerText = dEvent;
    disasterAlert.classList.remove('hidden');
    setTimeout(() => {
        disasterAlert.classList.add('hidden');
    }, 2000);
}



// Shop logic
function openShop() {
    uiSummary.classList.add('hidden');
    currentShopPlayer = 0;
    isSellingMode = false;
    document.getElementById('sell-btn').innerText = "Sell Item";
    renderShopPlayer();
    uiShop.classList.remove('hidden');
    gameState = 'SHOP';
}

function initDebugUI() {
    const toggle = document.getElementById('toggle-debug');
    const content = document.getElementById('debug-content');
    if (!toggle || !content) return;

    toggle.onclick = () => content.classList.toggle('hidden');

    const tornadoRock = document.getElementById('debug-tornado-rock');
    const tornadoDirt = document.getElementById('debug-tornado-dirt');
    const tornadoSand = document.getElementById('debug-tornado-sand');

    if (tornadoRock) { tornadoRock.value = DEBUG_CONFIG.tornadoRockDepth; tornadoRock.onchange = (e) => DEBUG_CONFIG.tornadoRockDepth = parseFloat(e.target.value); }
    if (tornadoDirt) { tornadoDirt.value = DEBUG_CONFIG.tornadoDirtDepth; tornadoDirt.onchange = (e) => DEBUG_CONFIG.tornadoDirtDepth = parseFloat(e.target.value); }
    if (tornadoSand) { tornadoSand.value = DEBUG_CONFIG.tornadoSandDeletPct; tornadoSand.onchange = (e) => DEBUG_CONFIG.tornadoSandDeletPct = parseFloat(e.target.value); }

    const btnGrid = document.getElementById('debug-buttons');
    if (!btnGrid) return;

    const disasterTypes = [
        { name: 'EARTHQUAKE', label: '🌋 QUAKE', info: 'R: Dirt, D: Sand, T: Sand, P: 0' },
        { name: 'ASTEROID', label: '☄️ METEORS', info: 'R: Burn, D: Burn, T: Burn, P: 15-50' },
        { name: 'LIGHTNING', label: '⚡ LIGHTNING', info: 'R: Burn (25r), D: Burn, T: Burn, P: 15' },
        { name: 'VOLCANO', label: '🌋 VOLCANO', info: 'Rock -> Lava Melt' },
        { name: 'TORNADO', label: '🌪️ TORNADO', info: 'R: morph, D: morph, S: del, P: 0.5/tick' },
        { name: 'SANDSTORM', label: '🏜️ SANDSTORM', info: 'Wind, Sand, Push' },
        { name: 'LAVARIVER', label: '🌋 LAVA RIVER', info: 'Upward lava snake' },
        { name: 'STORM', label: '🌧️ STORM', info: 'Heavy rain, fills cavities' },
        { name: 'ALIEN', label: '👽 UFO', info: 'R: Crater, D: Lava, T: Burn, P: 30 (Laser)' }
    ];

    btnGrid.innerHTML = '';
    disasterTypes.forEach(d => {
        const container = document.createElement('div');
        container.className = 'debug-btn-container';

        const btn = document.createElement('button');
        btn.innerText = d.label;
        btn.onclick = () => triggerSpecificDisaster(d.name);

        const info = document.createElement('div');
        info.className = 'debug-btn-info';
        info.innerText = d.info;

        container.appendChild(btn);
        container.appendChild(info);
        btnGrid.appendChild(container);
    });
}

function triggerSpecificDisaster(type) {
    let dEvent = "";
    if (type === 'EARTHQUAKE') {
        dEvent = "EARTHQUAKE!";
        applyEarthquake(10 + Math.floor(Math.random() * 10), false);
    } else if (type === 'ASTEROID') {
        dEvent = "METEOR SHOWER!";
        let meteorWpn = { name: 'Meteor', damage: 30, radius: 25, count: 1, speed: 1.0, spread: 0, cost: 0, destroysRock: true, special: 'LAVA_ROCK_SMALL' };
        for (let i = 0; i < 15; i++) {
            projectiles.push(new Projectile(Math.random() * canvas.width, -100 - Math.random() * 400, (Math.random() - 0.5) * 4, 10 + Math.random() * 5, meteorWpn, null));
        }
    } else if (type === 'LIGHTNING') {
        dEvent = "LIGHTNING STORM!";
        let hitCount = Math.floor(Math.random() * 4) + 5;
        for (let i = 0; i < hitCount; i++) {
            setTimeout(() => {
                let lx = Math.random() * canvas.width;
                // 1) Find surface
                let ly = canvas.height - 10;
                let cx = Math.floor(lx / CELL);
                for (let py = 0; py < GH; py++) { if (grid[py * GW + cx] !== TYPE_AIR && grid[py * GW + cx] !== TYPE_WATER) { ly = py * CELL; break; } }

                // 2) Generate a fractal lightning structure
                let bolts = [];
                function buildBolt(startX, startY, endY, segments, spread, isMain) {
                    let pts = [{ x: startX, y: startY }];
                    let curY = startY, curX = startX;
                    let segH = (endY - startY) / segments;
                    for (let s = 1; s <= segments; s++) {
                        let ny = startY + s * segH;
                        let nx = curX + (Math.random() - 0.5) * spread;
                        pts.push({ x: nx, y: ny });
                        curX = nx; curY = ny;

                        if (isMain && Math.random() < 0.25 && s < segments - 1) {
                            let branchLen = (endY - ny) * (0.3 + Math.random() * 0.4);
                            let branchXDir = (Math.random() < 0.5 ? -1 : 1);
                            let endBranchX = nx + branchXDir * (30 + Math.random() * 40);
                            let endBranchY = ny + branchLen;
                            buildBolt(nx, ny, endBranchY, Math.floor(segments / 2), spread * 1.5, false);
                        }
                    }
                    bolts.push({ pts, isMain });
                    return pts[pts.length - 1];
                }

                let actualEnd = buildBolt(lx, -10, ly, 15, 25, true);

                // 3) Create disaster visual
                disasters.push({
                    active: true,
                    life: 25,
                    update: function () { this.life--; if (this.life <= 0) this.active = false; },
                    draw: function (ctx) {
                        ctx.save();
                        if (Math.random() < 0.2) return; // Flicker
                        for (let b of bolts) {
                            ctx.beginPath(); ctx.moveTo(b.pts[0].x, b.pts[0].y);
                            for (let p = 1; p < b.pts.length; p++) ctx.lineTo(b.pts[p].x, b.pts[p].y);
                            ctx.strokeStyle = '#000'; ctx.lineWidth = b.isMain ? 4 : 2; ctx.lineJoin = 'miter'; ctx.stroke();
                            if (b.isMain) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
                        }
                        ctx.restore();
                    }
                });

                let impactX = actualEnd.x;
                let impactY = actualEnd.y;

                explodeAt(impactX, impactY, 25, true);
                screenShake = 20;

                // ignite nearby trees and turn to sand
                staticEntities.forEach(ent => {
                    if (ent.active && (ent.type === 'TREE' || ent.type === 'PINE_TREE' || ent.type === 'CACTUS') && Math.abs(ent.x - impactX) < 80) {
                        ent.trigger();
                        setTimeout(() => {
                            if (ent.active && ent.state === 'BURNING') {
                                ent.active = false;
                                carveGrid(ent.x, ent.y - 30, 40, false);
                                for (let s = 0; s < 15; s++) {
                                    physicsParticles.push(new PhysicsParticle(ent.x + (Math.random() - 0.5) * 20, ent.y - 30 + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 4, -2 - Math.random() * 4, TYPE_SAND));
                                }
                            }
                        }, 2000);
                    }
                });
                tanks.forEach(t => { if (t.alive && Math.abs(t.x - impactX) < 60) t.takeDamage(15, null); });
            }, i * 300);
        }
    } else if (type === 'VOLCANO') {
        dEvent = "VOLCANIC ERUPTION!"; screenShake = 30;
        let bestY = GH, bestX = GW / 2;
        for (let x = 10; x < GW - 10; x += 10) { for (let y = 0; y < GH; y++) { if (grid[y * GW + x] !== TYPE_AIR) { if (y < bestY && Math.random() < 0.3) { bestY = y; bestX = x; } break; } } }
        let wx = bestX * CELL, wy = bestY * CELL;
        explodeAt(wx, wy, 150, true); carveGrid(wx, wy, 80, true);

        // Volcanic eruption: emit irregular black rocks with lava trails
        let vRock = { name: 'Volcanic Rock', damage: 40, radius: 25, count: 1, speed: 1.0, spread: 0, cost: 0, destroysRock: true, special: 'MELT_TO_LAVA' };
        for (let i = 0; i < 12; i++) {
            let vx = (Math.random() - 0.5) * 12;
            let vy = -12 - Math.random() * 10;
            projectiles.push(new Projectile(wx, wy, vx, vy, vRock, null));
        }

        // Also emit some loose lava splash
        for (let i = 0; i < 20; i++) {
            let vx = (Math.random() - 0.5) * 15;
            let vy = -10 - Math.random() * 15;
            physicsParticles.push(new PhysicsParticle(wx, wy, vx, vy, TYPE_LAVA));
        }
    } else if (type === 'TORNADO') {
        dEvent = "TORNADO!";
        disasters.push(new Tornado(Math.random() * canvas.width, GH / 2));
    } else if (type === 'SANDSTORM') {
        dEvent = "SANDSTORM!";
        disasters.push(new Sandstorm());
    } else if (type === 'LAVARIVER') {
        dEvent = "LAVA RIVER!";
        disasters.push(new LavaRiver());
    } else if (type === 'STORM') {
        dEvent = "STORM!";
        disasters.push(new Storm());
    } else if (type === 'ALIEN') {
        dEvent = "ALIEN INVASION!";
        let count = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < count; i++) setTimeout(() => disasters.push(new UFO()), i * 600);
    }

    disasterAlert.firstElementChild.innerText = dEvent;
    disasterAlert.classList.remove('hidden');
    setTimeout(() => disasterAlert.classList.add('hidden'), 2000);
}

// Init Debug UI
initDebugUI();

function renderShopPlayer() {
    let t = tanks[currentShopPlayer];
    if (!t) {
        console.error(`[Shop] Player ${currentShopPlayer} not found! Skipping to next.`);
        document.getElementById('next-shop-btn').click();
        return;
    }

    // Handle button states for Selling Mode
    const sellBtn = document.getElementById('sell-btn');
    const randomBtn = document.getElementById('random-buy-btn');
    const nextBtn = document.getElementById('next-shop-btn');
    const allRandomBtn = document.getElementById('buy-all-random-btn');

    if (isSellingMode) {
        if (sellBtn) sellBtn.innerText = "CANCEL SELLING";
        if (randomBtn) { randomBtn.disabled = true; randomBtn.classList.add('shop-item-disabled'); }
        if (nextBtn) { nextBtn.disabled = true; nextBtn.classList.add('shop-item-disabled'); }
        if (allRandomBtn) { allRandomBtn.disabled = true; allRandomBtn.classList.add('shop-item-disabled'); }
    } else {
        if (sellBtn) sellBtn.innerText = "Sell Item";
        if (randomBtn) { randomBtn.disabled = false; randomBtn.classList.remove('shop-item-disabled'); }
        if (nextBtn) { nextBtn.disabled = false; nextBtn.classList.remove('shop-item-disabled'); }
        if (allRandomBtn) { allRandomBtn.disabled = false; allRandomBtn.classList.remove('shop-item-disabled'); }
    }
    if (t.isBot) {
        let pool = WEAPONS.slice(1).concat(ITEMS.filter(it => it.id !== 'I4').map(it => ({ ...it, isItem: true })));
        let teleportItem = ITEMS.find(it => it.id === 'I4');
        if (teleportItem) pool.push(teleportItem);

        let safety = 100;
        while (safety-- > 0) {
            let affordable = pool.filter(item => t.money >= item.cost);
            if (affordable.length > 0) {
                let item = affordable[Math.floor(Math.random() * affordable.length)];
                t.money -= item.cost;
                if (item.apply) t.inventory.push({ ...item, isItem: true });
                else if (item.special === 'TELEPORT') t.inventory.push({ ...item });
                else t.inventory.push(item);
            } else {
                break;
            }
        }
        setTimeout(() => {
            let btn = document.getElementById('next-shop-btn');
            if (btn) btn.click();
        }, 50);
        return;
    }

    console.log(`[Shop] Rendering UI for ${t.name} (Sell Mode: ${isSellingMode})`);
    document.getElementById('shop-player-name').innerText = t.name + (isSellingMode ? " (SELLING)" : "");
    document.getElementById('shop-money').innerText = t.money;

    let container = document.getElementById('shop-items');
    container.innerHTML = '';

    if (isSellingMode) {
        // Build a catalog for selling (everything in shop)
        let buyPool = WEAPONS.slice(1);
        let storableItems = ITEMS.filter(it => it.id !== 'I4').map(it => ({ ...it, isItem: true }));
        let teleportItem = ITEMS.find(it => it.id === 'I4');
        let fullCatalog = buyPool.concat(storableItems);
        if (teleportItem) fullCatalog.push(teleportItem);

        // Map inventory for counts and indices
        let inventoryMap = {};
        t.inventory.forEach((item, idx) => {
            if (item.id === 'W1') return;
            if (!inventoryMap[item.id]) inventoryMap[item.id] = [];
            inventoryMap[item.id].push(idx);
        });

        fullCatalog.forEach(item => {
            if (!item) return;
            let owned = inventoryMap[item.id] || [];
            let count = owned.length;
            let refund = Math.floor(item.cost * 0.75);
            let icon = WEAPON_ICONS[item.id] || item.icon || '📦';
            let div = document.createElement('div');

            // Requested: "simply deactivate all items which ar enot in inventory. make them grey"
            div.className = 'shop-item' + (count > 0 ? '' : ' shop-item-disabled');
            div.setAttribute('tabindex', '0');

            div.innerHTML = `
                <div class="shop-item-icon">${icon}</div>
                <div class="shop-item-body">
                    <div class="shop-item-name">${item.name} <span class="shop-item-count">${count > 0 ? 'x' + count : ''}</span></div>
                    <div class="shop-item-desc">${count > 0 ? 'REFUND: $' + refund : 'NOT OWNED'}</div>
                </div>
                <div class="shop-item-cost">${count > 0 ? '+$' + refund : '-'}</div>
            `;

            if (count > 0) {
                div.onclick = () => {
                    let idxToRemove = owned.pop();
                    t.inventory.splice(idxToRemove, 1);
                    t.money += refund;
                    renderShopPlayer();
                };
            }
            container.appendChild(div);
        });
    } else {
        let addItems = (list) => {
            list.forEach(item => {
                if (!item) return;
                let count = (t.inventory || []).filter(i => i && i.id === item.id).length;
                let canAfford = t.money >= item.cost;
                let icon = WEAPON_ICONS[item.id] || item.icon || '📦';
                let div = document.createElement('div');
                div.className = 'shop-item' + (canAfford ? '' : ' shop-item-disabled');
                div.setAttribute('tabindex', '0');

                div.innerHTML = `
                    <div class="shop-item-icon">${icon}</div>
                    <div class="shop-item-body">
                        <div class="shop-item-name">${item.name} <span class="shop-item-count">${count > 0 ? 'x' + count : ''}</span></div>
                        <div class="shop-item-desc">${item.desc || ('DMG:' + item.damage + ' R:' + item.radius)}</div>
                    </div>
                    <div class="shop-item-cost">$${item.cost}</div>
                `;

                div.onclick = () => {
                    if (t.money >= item.cost) {
                        t.money -= item.cost;
                        if (item.apply) t.inventory.push({ ...item, isItem: true });
                        else if (item.special === 'TELEPORT') t.inventory.push({ ...item });
                        else t.inventory.push(item);
                        renderShopPlayer();
                    }
                };
                container.appendChild(div);
            });
        };
        try {
            addItems(WEAPONS.slice(1));
            let storableItems = ITEMS.filter(it => it.id !== 'I4').map(it => ({ ...it, isItem: true }));
            let teleportItem = ITEMS.find(it => it.id === 'I4');
            addItems(storableItems);
            if (teleportItem) addItems([teleportItem]);
        } catch (e) {
            console.error("Shop render error:", e);
            alert("SHOP ERROR: " + e.message);
        }
    }
}

let sellBtn = document.getElementById('sell-btn');
if (sellBtn) {
    sellBtn.onclick = () => {
        isSellingMode = !isSellingMode;
        // Requested: "Sell button change text on it to cancell"
        sellBtn.innerText = isSellingMode ? "CANCEL" : "Sell Item";
        renderShopPlayer();
    };
} else {
    console.warn("Sell button missing in DOM");
}

let nextShopBtn = document.getElementById('next-shop-btn');
if (nextShopBtn) {
    nextShopBtn.onclick = () => {
        console.log(`[Shop] Next clicked. Current: ${currentShopPlayer}, Total: ${pCount}`);
        currentShopPlayer++;
        if (currentShopPlayer >= pCount) {
            console.log('[Shop] All players done. Starting round.');
            startRound();
        } else {
            console.log(`[Shop] Rendering player ${currentShopPlayer}`);
            renderShopPlayer();
        }
    }
}

let randomBuyBtn = document.getElementById('random-buy-btn');
if (randomBuyBtn) {
    randomBuyBtn.onclick = () => {
        let t = tanks[currentShopPlayer];
        let pool = WEAPONS.slice(1).concat(ITEMS.map(it => ({ ...it, isItem: true })));
        let affordable = pool.filter(item => t.money >= item.cost);

        if (affordable.length > 0) {
            let item = affordable[Math.floor(Math.random() * affordable.length)];
            t.money -= item.cost;
            if (item.apply) t.inventory.push({ ...item, isItem: true });
            else if (item.special === 'TELEPORT') t.inventory.push({ ...item });
            else t.inventory.push(item);
            renderShopPlayer();
        }
    }
}

let buyAllRandomBtn = document.getElementById('buy-all-random-btn');
if (buyAllRandomBtn) {
    buyAllRandomBtn.onclick = () => {
        let pool = WEAPONS.slice(1).concat(ITEMS.map(it => ({ ...it, isItem: true })));
        tanks.forEach(t => {
            // Apply 3 random items to each player
            for (let i = 0; i < 3; i++) {
                let affordable = pool.filter(item => t.money >= item.cost);
                if (affordable.length > 0) {
                    let item = affordable[Math.floor(Math.random() * affordable.length)];
                    t.money -= item.cost;
                    if (item.apply) t.inventory.push({ ...item, isItem: true });
                    else if (item.special === 'TELEPORT') t.inventory.push({ ...item });
                    else t.inventory.push(item);
                }
            }
        });
        sfx.playUI();
        // Requested: "if buy random for all players, you can start game right away it is clicked."
        startRound();
    }
}

// Enable drag-to-scroll for the shop grid
function initShopDragScroll() {
    const grid = document.getElementById('shop-items');
    if (!grid) return;

    let isDown = false;
    let startY;
    let scrollTop;

    grid.addEventListener('pointerdown', (e) => {
        isDown = true;
        grid.style.cursor = 'grabbing';
        startY = e.pageY - grid.offsetTop;
        scrollTop = grid.scrollTop;
    });

    grid.addEventListener('pointerleave', () => {
        isDown = false;
        grid.style.cursor = 'grab';
    });

    grid.addEventListener('pointerup', () => {
        isDown = false;
        grid.style.cursor = 'grab';
    });

    grid.addEventListener('pointermove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const y = e.pageY - grid.offsetTop;
        const walk = (y - startY) * 2; // scroll-fast multiplier
        grid.scrollTop = scrollTop - walk;
    });

    // Explicit mouse wheel handling for better reliability in overlays
    grid.addEventListener('wheel', (e) => {
        grid.scrollTop += e.deltaY;
    }, { passive: true });

    grid.style.cursor = 'grab';
}
initShopDragScroll();

function updateHUD() {
    if (gameState !== 'AIMING') return;
    let t = tanks[currentPlayerIndex];
    if (!t) return;

    // Safety for weapon index
    if (!t.inventory[t.weaponIndex]) {
        console.warn(`Invalid weapon index ${t.weaponIndex}. Resetting to 0.`);
        t.weaponIndex = 0;
    }

    let w = t.inventory[t.weaponIndex];
    if (w) {
        if (currentWeaponNameEl) currentWeaponNameEl.innerText = w.name;
    } else {
        if (currentWeaponNameEl) currentWeaponNameEl.innerText = "NO WEAPON";
        // Final fallback if inventory is empty
        if (t.inventory.length === 0) {
            t.inventory.push(WEAPONS[0]);
            currentWeaponNameEl.innerText = WEAPONS[0].name;
        }
    }
    renderHealthBars();
}

function renderHealthBars() {
    if (!healthBarsContainer) return;

    let pCountLocal = tanks.length;

    healthBarsContainer.innerHTML = tanks.map((t, idx) => {
        let hpPct = Math.max(0, Math.min(100, t.hp));
        let shieldPct = Math.max(0, Math.min(100, t.shield));
        let fuelPct = Math.max(0, Math.min(100, (t.fuel / 1000.0) * 100));

        let col = (idx % 4) + 1;
        if (pCountLocal === 2 && idx === 1) col = 4;
        if (pCountLocal === 3 && idx === 2) col = 4;
        let row = Math.floor(idx / 4) + 1;
        let gridPos = `grid-column: ${col}; grid-row: ${row};`;

        // Decay event timer
        if (t.lastEventTimer > 0) t.lastEventTimer--;
        else t.lastEvent = null;

        // Item grouping
        let groups = {};
        let uniqueItems = [];
        t.inventory.forEach(i => {
            if (!groups[i.id]) {
                groups[i.id] = { count: 0, ref: i };
                uniqueItems.push(i.id);
            }
            if (groups[i.id].count < 9) groups[i.id].count++;
        });

        let currentWeaponId = (t.inventory && t.inventory[t.weaponIndex]) ? t.inventory[t.weaponIndex].id : null;

        let invHtml = '<div style="display:flex; flex-wrap:wrap; margin-top:2px; gap:2px; padding-top:2px; border-top:1px solid #000; justify-content:flex-start;">';
        uniqueItems.forEach(k => {
            if (k === 'W1') return;
            let info = groups[k];
            let isSelected = (k === currentWeaponId && t === tanks[currentPlayerIndex] && gameState === 'AIMING');
            let borderStyle = isSelected ? 'border:1px solid #f00; background:#400; color:#fff;' : 'border:1px solid #000; background:#000; color:#fff;';
            let icon = WEAPON_ICONS[info.ref.id] || info.ref.icon || '❓';
            invHtml += `<div style="display:flex; flex-direction:column; align-items:center; padding:1px 2px; ${borderStyle} border-radius:1px; position:relative; min-width:18px;" title="${info.ref.name}">`;
            invHtml += `<span style="font-size:12px; line-height:1;">${icon}</span><span style="font-size:7px; line-height:1; font-weight:bold;">${info.count}</span></div>`;
        });
        invHtml += '</div>';

        let isActive = t === tanks[currentPlayerIndex] && gameState === 'AIMING';
        let nameStyle = isActive ? 'font-weight:bold; font-size:0.6rem; color:#d00;' : '';

        // Floating event toast above name
        let toastHtml = '';
        if (t.lastEvent && t.lastEventTimer > 0) {
            let opacity = Math.min(1, t.lastEventTimer / 20);
            let rise = (90 - t.lastEventTimer) * 0.3;
            toastHtml = `<div style="font-size:0.45rem; color:#c00; text-align:center; transform:translateY(-${rise}px); opacity:${opacity}; pointer-events:none; white-space:nowrap;">${t.lastEvent}</div>`;
        }

        return `<div class="health-box" style="${gridPos} opacity: ${t.alive ? 1 : 0.3}">
            ${toastHtml}
            <div class="health-name" style="${nameStyle}">${isActive ? '▶ ' : ''}${t.name}</div>
            <div style="display:flex; align-items:center; gap:2px; margin-bottom:1px;">
                <span style="font-size:8px;">❤️</span>
                <div class="bar-bg health-bar-bg" style="flex:1; margin:0;">
                    <div class="health-bar-fg" style="width: ${hpPct}%;"></div>
                    <div class="health-bar-shield" style="width: ${shieldPct}%;"></div>
                </div>
                <span style="font-size:6px; min-width:14px; text-align:right;">${Math.round(t.hp)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:2px; margin-bottom:1px;">
                <span style="font-size:8px;">⛽</span>
                <div class="bar-bg fuel-bar-bg" style="flex:1; margin:0;">
                    <div class="fuel-bar-fg" style="width: ${fuelPct}%;"></div>
                </div>
            </div>
            ${invHtml}
        </div>`;
    }).join('');
}

function fireProjectile() {
    let t = tanks[currentPlayerIndex];
    let w = t.inventory[t.weaponIndex];
    t.shotsFired++;

    let bx = t.x + Math.cos(t.angle) * 15;
    let by = t.y - 10 - Math.sin(t.angle) * 15;
    let baseVX = Math.cos(t.angle) * (t.power * 0.5) * w.speed;
    let baseVY = -Math.sin(t.angle) * (t.power * 0.5) * w.speed;

    if (w.special === 'LASER') {
        let lx = bx;
        let ly = by;
        let stepX = Math.cos(t.angle) * 2;
        let stepY = -Math.sin(t.angle) * 2;

        let carvedArea = false;
        let hitTanks = new Set();

        // Raycast loop
        for (let s = 0; s < 1000; s++) { // 2000px range
            lx += stepX;
            ly += stepY;

            if (lx < 0 || lx > canvas.width || Math.floor(ly / CELL) >= GH) break;
            if (ly < 0) continue;

            let cx = Math.floor(lx / CELL);
            let cy = Math.floor(ly / CELL);

            if (cx >= 0 && cx < GW && cy >= 0 && cy < GH) {
                let type = grid[cy * GW + cx];
                if (type === TYPE_WATER) {
                    break; // Blocked by water
                } else if (type !== TYPE_AIR && type !== TYPE_LAVA) {
                    // Melt terrain
                    let r = 2; // 2 cell thickness
                    for (let dy = -r; dy <= r; dy++) {
                        for (let dx = -r; dx <= r; dx++) {
                            if (dx * dx + dy * dy <= r * r) {
                                let nx = cx + dx, ny = cy + dy;
                                if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
                                    if (grid[ny * GW + nx] !== TYPE_AIR && grid[ny * GW + nx] !== TYPE_WATER && grid[ny * GW + nx] !== TYPE_LAVA) {
                                        grid[ny * GW + nx] = TYPE_LAVA;
                                        materialAge[ny * GW + nx] = 0;
                                        carvedArea = true;
                                        activeCols[nx] = 120; // Wake up physics
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Damage check
            tanks.forEach(target => {
                if (target.alive && target !== t && !hitTanks.has(target)) {
                    let dx = target.x - lx;
                    let dy = (target.y - 10) - ly;
                    if (Math.sqrt(dx * dx + dy * dy) < 20) {
                        target.takeDamage(w.damage, t);
                        hitTanks.add(target);
                    }
                }
            });

            // Red beam particles
            if (s % 4 === 0) particles.push(new Particle(lx + (Math.random() - 0.5) * 4, ly + (Math.random() - 0.5) * 4, 0, 0, '#f00', 10));
        }

        if (carvedArea) gridUpdated = true;
        sfx.playShoot(); // Reuse laser sound logic here?
    } else {
        for (let i = 0; i < w.count; i++) {
            let sc = (i - (w.count - 1) / 2) * w.spread;
            let c = Math.cos(sc), s = Math.sin(sc);
            let fx = baseVX * c - baseVY * s;
            let fy = baseVX * s + baseVY * c;
            projectiles.push(new Projectile(bx, by, fx, fy, w, t));
        }
    }

    if (t.weaponIndex > 0) {
        let currentId = w.id;
        t.inventory.splice(t.weaponIndex, 1);
        let nextIdx = t.inventory.findIndex(i => i.id === currentId);
        if (nextIdx !== -1) t.weaponIndex = nextIdx;
        else t.weaponIndex = 0;
    }

    // recoil particle
    for (let i = 0; i < 10; i++) particles.push(new Particle(bx, by, Math.cos(t.angle) * Math.random() * 2, -Math.sin(t.angle) * Math.random() * 2, '#000', 10));

    gameState = 'FIRING';
    physicsSettleFrames = 0;
    // Removed uiHud.classList.add('hidden') per request to keep controls visible
}

function update() {
    if (gameState === 'MENU' || gameState === 'SHOP' || gameState === 'ROUND_OVER') return;

    // Always decrement phase timer if active, regardless of state (unless menu/shop)
    if (genPhaseTimer > 0) genPhaseTimer--;

    // PHYSICS 2.0 - ACTIVE COLUMNS OPTIMIZATION
    let physicsRunning = updatePhysicsGrid();
    // let physicsRunning = false; 

    // Active Spawner Logic
    if (genPhase === 'UNDERGROUND_FLOW' && genPhaseTimer > 0) {
        genSpawners.forEach(s => {
            if (Math.random() < 0.4) { // Increased emission rate
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        let nx = s.x + dx, ny = s.y + dy;
                        if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) grid[ny * GW + nx] = s.type;
                    }
                }
            }
        });
    }

    // Active Rock Logic (Rigid bodies during gen)
    if (genPhase === 'ROCKS_FALLING') {
        rocks.forEach(r => {
            if (!r.settled) {
                r.update();
                if (r.settled) {
                    r.pasteToGrid();
                    gridUpdated = true;
                    if (gameState === 'GENERATING') drawMapPreview();
                }
            }
        });
    }

    if (gridUpdated && gameState === 'GENERATING') drawMapPreview();

    let canProceed = genPhaseTimer <= 0 && !physicsRunning;

    if (canProceed) {
        if (genPhase === 'ROCKS_STILL') {
            // Phase 1: Spawn Rigid Rocks in clumps
            rocks = [];
            let clumps = 6;
            for (let c = 0; c < clumps; c++) {
                let cx = Math.random() * GW;
                let num = 25 + Math.floor(Math.random() * 15);
                for (let n = 0; n < num; n++) {
                    let rx = cx + (Math.random() - 0.5) * 40;
                    let size = 6 + Math.random() * 14;
                    if (n % 5 === 0) size += 10; // Extra large boulder
                    rocks.push(new RigidRock(rx, -Math.random() * GH * 0.8, size, 4 + Math.floor(Math.random() * 4)));
                }
            }
            genPhase = 'ROCKS_FALLING'; genPhaseTimer = 60;
        } else if (genPhase === 'ROCKS_FALLING') {
            // Phase 2: All rocks must settle
            if (rocks.every(r => r.settled)) {
                rocks = [];
                // Pick underground spawners to fill gaps
                genSpawners = [];
                for (let i = 0; i < 15; i++) {
                    genSpawners.push({
                        x: Math.floor(Math.random() * GW),
                        y: Math.floor(GH * 0.5 + Math.random() * GH * 0.45),
                        type: Math.random() < 0.3 ? TYPE_LAVA : TYPE_WATER
                    });
                }
                genPhase = 'UNDERGROUND_FLOW'; genPhaseTimer = 180;
            }
        } else if (genPhase === 'UNDERGROUND_FLOW') {
            // Phase 3: Transition to carving caves
            genPhase = 'CARVE_CAVES'; genPhaseTimer = 30;
        } else if (genPhase === 'CARVE_CAVES') {
            // Carve tunnels and crevices through the rock masses
            for (let i = 0; i < 12; i++) {
                let tx = Math.floor(Math.random() * GW);
                let ty = Math.floor(GH * 0.4 + Math.random() * GH * 0.5);
                let steps = 15 + Math.floor(Math.random() * 20);
                for (let s = 0; s < steps; s++) {
                    let radius = 4 + Math.random() * 6;
                    for (let dy = -radius; dy <= radius; dy++) {
                        for (let dx = -radius; dx <= radius; dx++) {
                            if (dx * dx + dy * dy <= radius * radius) {
                                let nx = Math.floor(tx + dx), ny = Math.floor(ty + dy);
                                if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
                                    if (grid[ny * GW + nx] === TYPE_ROCK) grid[ny * GW + nx] = TYPE_AIR;
                                }
                            }
                        }
                    }
                    tx += (Math.random() - 0.5) * 8;
                    ty += (Math.random() - 0.5) * 8;
                }
            }
            genPhase = 'SPAWN_EARTH'; genPhaseTimer = 30;
        } else if (genPhase === 'SPAWN_EARTH') {
            // Phase 4: Earth layer (10 pixels)
            for (let x = 0; x < GW; x++) {
                for (let y = 0; y < 10; y++) {
                    if (Math.random() < 0.9) grid[y * GW + x] = TYPE_EARTH;
                }
            }
            genPhase = 'SETTLE_EARTH'; genPhaseTimer = 180;
            activeCols.fill(1);
        } else if (genPhase === 'SETTLE_EARTH') {
            // Phase 5: Sand layer (5 pixels)
            for (let x = 0; x < GW; x++) {
                for (let y = 0; y < 5; y++) {
                    if (Math.random() < 0.8) grid[y * GW + x] = TYPE_SAND;
                }
            }
            genPhase = 'SETTLE_SAND'; genPhaseTimer = 120;
            activeCols.fill(1);
        } else if (genPhase === 'SETTLE_SAND') {
            // Phase 6: Trees
            let spots = [];
            for (let x = 10; x < GW - 10; x += 12) {
                let y = 0; while (y < GH && (grid[y * GW + x] === TYPE_AIR || grid[y * GW + x] === TYPE_WATER)) y++;
                if (y < GH && (grid[y * GW + x] === TYPE_EARTH || grid[y * GW + x] === TYPE_SAND)) spots.push({ x, y });
            }
            spots.sort(() => Math.random() - 0.5).slice(0, 15).forEach(s => {
                let cells = generateTreeCells(Math.random() > 0.5 ? 'PINE_TREE' : 'TREE');
                cells.forEach(c => {
                    let nx = s.x + c.dx, ny = s.y + c.dy;
                    if (nx >= 0 && nx < GW && ny >= 0 && ny < GH && grid[ny * GW + nx] === TYPE_AIR) grid[ny * GW + nx] = c.type;
                });
            });
            genPhase = 'WATER_BLOBS'; genPhaseTimer = 60;
        } else if (genPhase === 'WATER_BLOBS') {
            // Phase 7: Rain water blobs
            for (let i = 0; i < 15; i++) {
                let wx = Math.floor(Math.random() * GW), wy = 0, wr = 6 + Math.random() * 12;
                for (let dy = -wr; dy <= wr; dy++) {
                    for (let dx = -wr; dx <= wr; dx++) {
                        if (dx * dx + dy * dy <= wr * wr) {
                            let nx = wx + dx, ny = wy + dy;
                            if (nx >= 0 && nx < GW && ny >= 0 && ny < GH && grid[ny * GW + nx] === TYPE_AIR) grid[ny * GW + nx] = TYPE_WATER;
                        }
                    }
                }
            }
            genPhase = 'SETTLE_FINAL'; genPhaseTimer = 240;
            activeCols.fill(1);
        } else if (genPhase === 'SETTLE_FINAL') {
            // Phase 8: Players spawn
            genPhase = 'SETTLE_TANKS';
            finalizeRoundStart();
        } else if (genPhase === 'SETTLE_TANKS') {
            let tanksStable = tanks.filter(t => t.alive).every(t => !t.isFalling);
            if (tanksStable) {
                genPhase = 'OFF';
                if (tanks.length > 0) {
                    gameState = 'INTRO';
                    introPhase = 0;
                    introTimer = 120; // 2 seconds on full map

                    // Full map zoom
                    // Full map zoom
                    targetCamY = (1080 - (window.innerHeight / baseScale)) / 2;
                    uiHud.classList.add('hidden');
                    if (turnTimerUI) turnTimerUI.classList.add('hidden');
                } else {
                    gameState = 'MENU';
                }
            }
        }
        gridUpdated = true;
    }


    tanks.forEach(t => { if (t.alive) t.fall(); });
    staticEntities.forEach(ent => ent.update());

    if (gameState === 'INTRO') {
        introTimer--;
        if (introTimer <= 0) {
            introPhase++;
            if (introPhase <= tanks.length) {
                // Show a player
                let t = tanks[introPhase - 1];
                if (t && t.alive) {
                    targetCamZoom = 2.0;
                    let baseScale = window.innerWidth / 1920;
                    let targetTotalScale = baseScale * targetCamZoom;
                    let viewW = window.innerWidth / targetTotalScale;
                    let viewH = window.innerHeight / targetTotalScale;
                    targetCamX = t.x - viewW / 2;
                    targetCamY = (t.y - 40) - viewH / 2;
                    introTimer = 90; // 1.5 seconds per player
                } else {
                    introTimer = 0; // Skip dead tanks instantly
                }
            } else {
                // Intro Finished -> Start Game
                gameState = 'AIMING';
                uiHud.classList.remove('hidden');
                if (turnTimerUI) turnTimerUI.classList.remove('hidden');
                turnTimer = TURN_TIME_LIMIT;
                updateHUD();

                let t = tanks[currentPlayerIndex];
                targetCamZoom = 2.0;
                let baseScale = window.innerWidth / 1920;
                let targetTotalScale = baseScale * targetCamZoom;
                let viewW = window.innerWidth / targetTotalScale;
                let viewH = window.innerHeight / targetTotalScale;
                targetCamX = t.x - viewW / 2;
                targetCamY = (t.y - 40) - viewH / 2;

                if (!t.alive) passTurn();
                else if (t.isBot) setTimeout(() => playBotTurn(), 500);
            }
        }
    } else if (gameState === 'AIMING') {
        let t = tanks[currentPlayerIndex];
        // SAFETY CHECK
        if (!t) return;

        // Turn Timer Logic
        turnTimer -= dt;
        if (turnTimerUI) {
            turnTimerUI.innerText = Math.ceil(Math.max(0, turnTimer));
            if (turnTimer < 10) turnTimerUI.style.color = '#f00';
            else turnTimerUI.style.color = '#fff';
        }

        if (turnTimer <= 0) {
            passTurn();
            return;
        }

        // Camera Follow Active Player if not panning
        if (!isPanning) {
            let baseScale = window.innerWidth / 1920;
            let targetTotalScale = baseScale * targetCamZoom;
            let viewW = window.innerWidth / targetTotalScale;
            let viewH = window.innerHeight / targetTotalScale;
            targetCamX = t.x - viewW / 2;
            targetCamY = (t.y - 40) - viewH / 2;
        }

        if (t.isBot) return; // Prevent user keyboard input on bot turn

        let kLeft = keys['arrowleft'] || keys['a'];
        let kRight = keys['arrowright'] || keys['d'];
        let kUp = keys['arrowup'] || keys['w'];
        let kDown = keys['arrowdown'] || keys['s'];

        if (t.actionMode === 'AIMING') {
            if (kLeft) t.angle += 0.02;
            if (kRight) t.angle -= 0.02;
            if (kUp) t.power = Math.min(100, t.power + 0.5);
            if (kDown) t.power = Math.max(0, t.power - 0.5);
            if (t.angle < 0) t.angle += Math.PI * 2;
            if (t.angle > Math.PI * 2) t.angle -= Math.PI * 2;
        } else if (t.actionMode === 'MOVING') {
            let mSpeed = 1;
            let fuelCost = mSpeed; // 1 unit = 1 pixel

            // slope checking
            let checkMove = (dx) => {
                let currentX = Math.floor(t.x / CELL);
                let currentY = Math.floor(t.y / CELL);
                let stepX = Math.floor((t.x + dx) / CELL);
                if (stepX < 0 || stepX >= GW) return false;

                let getSurfY = (x) => {
                    for (let py = 0; py < GH; py++) {
                        let typ = grid[py * GW + x];
                        if (typ !== TYPE_AIR && typ !== TYPE_WATER && typ !== TYPE_LAVA) return py;
                    }
                    return GH - 1;
                };

                let y1 = getSurfY(currentX);

                // Tunneling check: if the tank is buried, allow pushing through sand/dirt
                if (t.isBuried) {
                    // Check pixels in a bounding box in front of the tank
                    let canTunnel = true;
                    // Check local column at stepX from tank top to bottom
                    for (let py = currentY - 5; py <= currentY; py++) {
                        if (py >= 0 && py < GH) {
                            let typ = grid[py * GW + stepX];
                            if (typ === TYPE_ROCK || typ === TYPE_WOOD || typ === TYPE_TREE) {
                                canTunnel = false;
                                break;
                            }
                        }
                    }
                    if (canTunnel) {
                        // Perform tunneling (convert SAND/DIRT to AIR)
                        for (let py = currentY - 5; py <= currentY; py++) {
                            if (py >= 0 && py < GH) {
                                let typ = grid[py * GW + stepX];
                                if (typ === TYPE_SAND || typ === TYPE_EARTH) {
                                    grid[py * GW + stepX] = TYPE_AIR;
                                    gridUpdated = true;
                                    markActiveArea(stepX * CELL, 5);
                                }
                            }
                        }
                        return true;
                    }
                    return false;
                }

                // Normal unburied movement checks below
                let y2 = getSurfY(stepX);

                // Immediate 90-degree wall block (e.g. wall height > 4 cells straight up)
                if (y1 - y2 > 4) return false;

                // Average over 20 blocks
                let startX = currentX;
                let checkDist = 20;
                let endX = startX + Math.sign(dx) * checkDist;
                if (endX < 0) endX = 0;
                if (endX >= GW) endX = GW - 1;

                let startY = getSurfY(startX);
                let endY = getSurfY(endX);

                let dy = startY - endY;
                let dxx = Math.abs(startX - endX);

                if (dy > 0 && dxx > 0) { // climbing
                    let slope = dy / dxx; // tangent
                    // 80 degrees tangent is ~5.67
                    if (slope > 5.67) return false; // Too steep!
                }

                return true;
            };

            // Notice we removed !t.isBuried because the checkMove handles tunneling explicitly
            // We removed the severe disasters.length === 0 freeze so players can move while things are happening
            // Move to Click logic
            if (t.moveTargetX !== null) {
                let dx = t.moveTargetX - t.x;
                if (Math.abs(dx) > mSpeed) {
                    let moveDir = Math.sign(dx);
                    if (t.fuel >= fuelCost && checkMove(moveDir)) {
                        t.x += moveDir * mSpeed;
                        t.fuel -= fuelCost;
                        t.fall();
                    } else {
                        t.moveTargetX = null;
                    }
                } else {
                    t.moveTargetX = null;
                }
            }

            if (kLeft && t.fuel >= fuelCost && checkMove(-1)) { t.x -= mSpeed; t.fuel -= fuelCost; updateHUD(); t.fall(); t.moveTargetX = null; }
            if (kRight && t.fuel >= fuelCost && checkMove(1)) { t.x += mSpeed; t.fuel -= fuelCost; updateHUD(); t.fall(); t.moveTargetX = null; }

            // clamp
            t.x = Math.max(20, Math.min(canvas.width - 20, t.x));
        }
        if (kLeft || kRight || kUp || kDown) {
            updateHUD();
        }
    }

    projectiles.forEach(p => p.update());
    particles.forEach(p => p.update());
    physicsParticles.forEach(p => p.update());
    disasters.forEach(d => d.update());
    rocks.forEach(r => r.draw(ctx));

    // Teleport auto-trigger: if a projectile gets close to a tank with a Teleporter item
    if (gameState === 'FIRING' || gameState === 'DISASTER') {
        for (let t of tanks) {
            if (!t.alive) continue;
            let teleIdx = t.inventory.findIndex(i => i.special === 'TELEPORT');
            if (teleIdx === -1) continue;

            let triggered = false;
            for (let p of projectiles) {
                if (!p.active || p.owner === t) continue;
                let dx = p.x - t.x, dy = p.y - t.y;
                if (dx * dx + dy * dy < 120 * 120) { triggered = true; break; }
            }

            if (triggered) {
                t.inventory.splice(teleIdx, 1); // consume item
                // Warp to random X position
                let rx = Math.floor(30 + Math.random() * (GW - 60));
                t.x = rx * CELL;
                t.y = 0; // start at top (parachutes down)
                t.isFalling = true;
                // Teleport FX
                for (let i = 0; i < 20; i++) {
                    particles.push(new Particle(t.x + (Math.random() - 0.5) * 30, t.y + (Math.random() - 0.5) * 30,
                        (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, '#0ff', 30));
                }
                if (t.weaponIndex >= t.inventory.length) t.weaponIndex = 0;
            }
        }
    }


    projectiles = projectiles.filter(p => p.active);
    particles = particles.filter(p => p.life > 0);
    physicsParticles = physicsParticles.filter(p => p.active);
    staticEntities = staticEntities.filter(p => p.active);
    disasters = disasters.filter(p => p.active);

    if (gameState === 'FIRING' || gameState === 'DISASTER') {
        // Only block on projectiles and disasters — NOT particles (burning trees emit forever)
        if (projectiles.length === 0 && disasters.length === 0 && physicsParticles.length === 0) {
            physicsSettleFrames++;
            if (!gridUpdated || physicsSettleFrames > 60) {
                physicsSettleFrames = 0;
                globalCollapse = 0;
                passTurn();
            }
        } else {
            physicsSettleFrames = 0;
        }
        if (globalCollapse > 0) globalCollapse--;
    }
}

function draw() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'MENU') return;
    if (!terrainCanvas || terrainCanvas.width === 0) return; // Safety check

    ctx.save();

    // Use a very smooth easing function
    const zoomSmoothness = 1.5; // Lower is slower/smoother
    const camSmoothness = 1.2;

    camZoom += (targetCamZoom - camZoom) * (1 - Math.pow(0.01, dt * zoomSmoothness));

    let lerpSpeed = isPanning ? 5.0 : 1.0;
    let baseScale = window.innerWidth / 1920;
    let totalScale = baseScale * camZoom;

    // Calculate maximum scroll bounds
    let maxCamX = Math.max(0, 1920 - (window.innerWidth / totalScale));

    // ALWAYS center vertically if map is shorter than window, otherwise respect targetCamY
    let viewH = window.innerHeight / totalScale;
    if (1080 < viewH) {
        targetCamY = (1080 - viewH) / 2;
    }

    // Clamp horizontal targets to prevent revealing the side 'void'
    targetCamX = Math.max(0, Math.min(maxCamX, targetCamX));

    // Apply smooth movement to actual cam coordinates
    // Using simple lerp for camX/Y but scale to feel premium
    camX += (targetCamX - camX) * (1 - Math.pow(0.01, dt * camSmoothness * lerpSpeed));
    camY += (targetCamY - camY) * (1 - Math.pow(0.01, dt * camSmoothness * lerpSpeed));

    // Final horizontal safety clamp
    camX = Math.max(0, Math.min(maxCamX, camX));

    canvas.style.transform = `scale(${totalScale}) translate(${-camX}px, ${-camY}px)`;

    if (screenShake > 0) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
        screenShake *= 0.8;
        if (screenShake < 0.5) screenShake = 0;
    }

    // Grid terrain
    if (gridUpdated) redrawTerrainCanvas();
    ctx.drawImage(terrainCanvas, 0, 0, GW, GH, 0, 0, 1920, 1080);

    // Static Decor
    staticEntities.forEach(e => e.draw(ctx));

    // Entities
    tanks.forEach(t => t.draw(ctx));
    projectiles.forEach(p => p.draw(ctx));
    particles.forEach(p => p.draw(ctx));
    physicsParticles.forEach(p => p.draw(ctx));
    disasters.forEach(d => d.draw(ctx));

    ctx.restore();
}

function loop() {
    const now = performance.now();
    dt = Math.min(100, now - lastFrameTime) / 1000; // Delta time in seconds
    lastFrameTime = now;

    update();
    draw();
    requestAnimationFrame(loop);
}

// Ensure fonts loaded somewhat before first draw
setTimeout(loop, 100);
