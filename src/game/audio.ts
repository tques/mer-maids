/**
 * audio.ts — Web Audio API Sound Engine
 *
 * All sounds synthesized procedurally — no audio files required.
 * Uses a single shared AudioContext created on first user interaction.
 *
 * Design goals:
 * - Non-annoying: short, punchy, low volume
 * - Distinct: each sound has a clear identity
 * - Performant: no per-frame allocations for looping sounds
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

// Looping nodes for continuous sounds
let jetNode: OscillatorNode | null = null;
let jetGain: GainNode | null = null;
let missileWarnNode: OscillatorNode | null = null;
let missileWarnGain: GainNode | null = null;
let subWarnNode: OscillatorNode | null = null;
let subWarnGain: GainNode | null = null;

// Throttle helpers — prevent the same sound firing every frame
const lastPlayed: Record<string, number> = {};
function throttle(key: string, minGapMs: number): boolean {
  const now = performance.now();
  if ((now - (lastPlayed[key] ?? -9999)) < minGapMs) return false;
  lastPlayed[key] = now;
  return true;
}

export function initAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.35;
  masterGain.connect(ctx.destination);
}

function getCtx(): { ctx: AudioContext; master: GainNode } | null {
  if (!ctx || !masterGain) return null;
  if (ctx.state === 'suspended') ctx.resume();
  return { ctx, master: masterGain };
}

// ---- Utility: noise buffer ----
function makeNoise(audioCtx: AudioContext, duration: number): AudioBufferSourceNode {
  const bufLen = Math.ceil(audioCtx.sampleRate * duration);
  const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  return src;
}

// ==================== PLAYER SHOOT ====================
// Short, crisp, suppressed "pew" — tonal descend + tiny click
export function sfxShoot() {
  const ac = getCtx();
  if (!ac) return;
  if (!throttle('shoot', 120)) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  osc.connect(gain); gain.connect(master);
  osc.start(now); osc.stop(now + 0.09);
}

// ==================== JET THRUST (looping) ====================
// Airy filtered noise that ramps up/down with throttle
export function sfxJetStart() {
  const ac = getCtx();
  if (!ac || jetNode) return;
  const { ctx: c, master } = ac;

  const bufLen = c.sampleRate * 2;
  const buf = c.createBuffer(1, bufLen, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 400;
  filter.Q.value = 0.8;

  const gain = c.createGain();
  gain.gain.value = 0;

  src.connect(filter); filter.connect(gain); gain.connect(master);
  src.start();
  jetNode = src as any;
  jetGain = gain;
}

export function sfxJetUpdate(throttle_: number, submerged: boolean) {
  if (!jetGain) return;
  const target = submerged ? 0.04 : throttle_ * 0.13;
  jetGain.gain.setTargetAtTime(target, ctx!.currentTime, 0.05);
}

export function sfxJetStop() {
  if (!jetGain || !jetNode) return;
  jetGain.gain.setTargetAtTime(0, ctx!.currentTime, 0.1);
  const node = jetNode;
  setTimeout(() => { try { node.stop(); } catch {} }, 400);
  jetNode = null;
  jetGain = null;
}

// ==================== ENEMY SHOOT ====================
// Harsher, buzzier than player — sawtooth descend
export function sfxEnemyShoot() {
  const ac = getCtx();
  if (!ac) return;
  if (!throttle('enemyshoot', 200)) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.connect(gain); gain.connect(master);
  osc.start(now); osc.stop(now + 0.13);
}

// ==================== EXPLOSION — ENEMY DEATH ====================
// Punchy noise burst with low thud
export function sfxExplosion() {
  const ac = getCtx();
  if (!ac) return;
  if (!throttle('explosion', 80)) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  // Noise burst
  const noise = makeNoise(c, 0.4);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1200, now);
  filter.frequency.exponentialRampToValueAtTime(80, now + 0.35);
  const nGain = c.createGain();
  nGain.gain.setValueAtTime(0.5, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
  noise.connect(filter); filter.connect(nGain); nGain.connect(master);
  noise.start(now); noise.stop(now + 0.4);

  // Low thud punch
  const osc = c.createOscillator();
  const oGain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
  oGain.gain.setValueAtTime(0.4, now);
  oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc.connect(oGain); oGain.connect(master);
  osc.start(now); osc.stop(now + 0.2);
}

// ==================== EXPLOSION — MINE / HEAVY ====================
// Deeper, longer than regular explosion
export function sfxExplosionHeavy() {
  const ac = getCtx();
  if (!ac) return;
  if (!throttle('explosion_heavy', 150)) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  const noise = makeNoise(c, 0.7);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(40, now + 0.6);
  const nGain = c.createGain();
  nGain.gain.setValueAtTime(0.55, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
  noise.connect(filter); filter.connect(nGain); nGain.connect(master);
  noise.start(now); noise.stop(now + 0.7);

  const osc = c.createOscillator();
  const oGain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(60, now);
  osc.frequency.exponentialRampToValueAtTime(18, now + 0.25);
  oGain.gain.setValueAtTime(0.5, now);
  oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(oGain); oGain.connect(master);
  osc.start(now); osc.stop(now + 0.3);
}

// ==================== BOMB DROP ====================
// Whistling descend
export function sfxBombDrop() {
  const ac = getCtx();
  if (!ac) return;
  if (!throttle('bomb', 300)) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.5);
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain); gain.connect(master);
  osc.start(now); osc.stop(now + 0.5);
}

// ==================== BARRIER HIT ====================
// High metallic ping — dome deflecting a bomb
export function sfxBarrierHit() {
  const ac = getCtx();
  if (!ac) return;
  if (!throttle('barrier', 200)) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1800, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.3);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(gain); gain.connect(master);
  osc.start(now); osc.stop(now + 0.31);
}

// ==================== PLATFORM BUMP ====================
// Short dull thud
export function sfxPlatformBump() {
  const ac = getCtx();
  if (!ac) return;
  if (!throttle('bump', 300)) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  const noise = makeNoise(c, 0.12);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  noise.connect(filter); filter.connect(gain); gain.connect(master);
  noise.start(now); noise.stop(now + 0.12);
}

// ==================== WATER SPLASH ====================
// Bright noise burst — entering water
export function sfxSplash() {
  const ac = getCtx();
  if (!ac) return;
  if (!throttle('splash', 400)) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  const noise = makeNoise(c, 0.35);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2000, now);
  filter.frequency.exponentialRampToValueAtTime(400, now + 0.3);
  filter.Q.value = 1.5;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
  noise.connect(filter); filter.connect(gain); gain.connect(master);
  noise.start(now); noise.stop(now + 0.35);
}

// ==================== PICKUP COLLECTED ====================
// Ascending three-note chime
export function sfxPickup() {
  const ac = getCtx();
  if (!ac) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;
  const notes = [523, 659, 784];
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.07;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain); gain.connect(master);
    osc.start(t); osc.stop(t + 0.16);
  });
}

// ==================== AMMO CRATE LAUNCH ====================
// Cannon thud + ascending whistle
export function sfxAmmoLaunch() {
  const ac = getCtx();
  if (!ac) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  // Cannon thud
  const noise = makeNoise(c, 0.15);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  const nGain = c.createGain();
  nGain.gain.setValueAtTime(0.4, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  noise.connect(filter); filter.connect(nGain); nGain.connect(master);
  noise.start(now); noise.stop(now + 0.15);

  // Rising whistle
  const osc = c.createOscillator();
  const oGain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now + 0.05);
  osc.frequency.exponentialRampToValueAtTime(1400, now + 0.5);
  oGain.gain.setValueAtTime(0.12, now + 0.05);
  oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(oGain); oGain.connect(master);
  osc.start(now + 0.05); osc.stop(now + 0.52);
}

// ==================== LOW AMMO WARNING ====================
// Dry double-click
export function sfxLowAmmo() {
  const ac = getCtx();
  if (!ac) return;
  if (!throttle('lowammo', 3000)) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;
  [0, 0.1].forEach(offset => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.04);
    osc.connect(gain); gain.connect(master);
    osc.start(now + offset); osc.stop(now + offset + 0.05);
  });
}

// ==================== LOW FUEL WARNING ====================
// Low sputtering tone
export function sfxLowFuel() {
  const ac = getCtx();
  if (!ac) return;
  if (!throttle('lowfuel', 2500)) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 80;
  gain.gain.setValueAtTime(0.07, now);
  gain.gain.setValueAtTime(0.0, now + 0.06);
  gain.gain.setValueAtTime(0.07, now + 0.12);
  gain.gain.setValueAtTime(0.0, now + 0.18);
  gain.gain.setValueAtTime(0.07, now + 0.24);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
  osc.connect(gain); gain.connect(master);
  osc.start(now); osc.stop(now + 0.35);
}

// ==================== MISSILE LOCK WARNING (looping) ====================
export function sfxMissileLockStart() {
  const ac = getCtx();
  if (!ac || missileWarnNode) return;
  const { ctx: c, master } = ac;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = 880;
  gain.gain.value = 0.06;
  osc.connect(gain); gain.connect(master);

  // Rapid beep pattern via gain modulation
  const now = c.currentTime;
  for (let i = 0; i < 40; i++) {
    gain.gain.setValueAtTime(i % 2 === 0 ? 0.06 : 0, now + i * 0.12);
  }

  osc.start(now);
  missileWarnNode = osc;
  missileWarnGain = gain;
}

export function sfxMissileLockStop() {
  if (!missileWarnGain || !missileWarnNode) return;
  missileWarnGain.gain.setTargetAtTime(0, ctx!.currentTime, 0.02);
  const node = missileWarnNode;
  setTimeout(() => { try { node.stop(); } catch {} }, 100);
  missileWarnNode = null;
  missileWarnGain = null;
}

// ==================== SUBMARINE WARNING (looping) ====================
export function sfxSubWarnStart() {
  const ac = getCtx();
  if (!ac || subWarnNode) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = 220;
  gain.gain.value = 0;

  // Slow sonar ping pattern
  for (let i = 0; i < 20; i++) {
    const t = now + i * 1.8;
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  }

  osc.connect(gain); gain.connect(master);
  osc.start(now);
  subWarnNode = osc;
  subWarnGain = gain;
}

export function sfxSubWarnStop() {
  if (!subWarnGain || !subWarnNode) return;
  subWarnGain.gain.setTargetAtTime(0, ctx!.currentTime, 0.05);
  const node = subWarnNode;
  setTimeout(() => { try { node.stop(); } catch {} }, 300);
  subWarnNode = null;
  subWarnGain = null;
}

// ==================== WAVE COMPLETE ====================
// Short triumphant ascending arpeggio
export function sfxWaveComplete() {
  const ac = getCtx();
  if (!ac) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;
  const notes = [392, 494, 587, 784];
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = now + i * 0.1;
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain); gain.connect(master);
    osc.start(t); osc.stop(t + 0.32);
  });
}

// ==================== EXTRA LIFE ====================
// Classic ascending run
export function sfxExtraLife() {
  const ac = getCtx();
  if (!ac) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;
  const notes = [262, 330, 392, 523, 659, 784];
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.06;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain); gain.connect(master);
    osc.start(t); osc.stop(t + 0.2);
  });
}

// ==================== GAME OVER ====================
// Slow descending dirge
export function sfxGameOver() {
  const ac = getCtx();
  if (!ac) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;
  const notes = [392, 330, 294, 220, 165];
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = now + i * 0.22;
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain); gain.connect(master);
    osc.start(t); osc.stop(t + 0.42);
  });
}

// ==================== PLAYER HIT ====================
// Sharp distorted zap
export function sfxPlayerHit() {
  const ac = getCtx();
  if (!ac) return;
  const { ctx: c, master } = ac;
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  osc.connect(gain); gain.connect(master);
  osc.start(now); osc.stop(now + 0.23);
}
