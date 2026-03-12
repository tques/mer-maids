// Wave management system

export interface WaveState {
  wave: number;
  waveActive: boolean;
  waveTimer: number;        // time elapsed in current wave
  waveDuration: number;     // how long this wave lasts
  transitionTimer: number;  // countdown during transition screen
  transitionActive: boolean;
  scoreAtWaveStart: number;
  enemiesFleeing: boolean;
  fleeTimer: number;
}

const BASE_WAVE_DURATION = 120; // 2 minutes minimum
const TRANSITION_DURATION = 4;  // 4 seconds between waves

export function createWaveState(): WaveState {
  return {
    wave: 1,
    waveActive: true,
    waveTimer: 0,
    waveDuration: BASE_WAVE_DURATION,
    transitionTimer: 0,
    transitionActive: false,
    scoreAtWaveStart: 0,
    enemiesFleeing: false,
    fleeTimer: 0,
  };
}

export function getWaveDuration(wave: number): number {
  // Each wave gets longer: 120s, 135s, 150s, 170s, ...
  return BASE_WAVE_DURATION + (wave - 1) * 15 + Math.floor((wave - 1) * (wave - 1) * 2);
}

/** Returns difficulty multiplier for the current wave (affects spawn rates) */
export function getWaveDifficulty(wave: number): number {
  // Wave 1 = 1.0, Wave 2 = 1.3, Wave 3 = 1.6, etc.
  return 1.0 + (wave - 1) * 0.3;
}

/** Score threshold to end the current wave */
export function getWaveScoreThreshold(wave: number): number {
  // Wave 1: 500, Wave 2: 1200, Wave 3: 2200, ...
  return 300 + wave * 200 + Math.floor(wave * wave * 100);
}

export function updateWave(state: WaveState, dt: number, currentScore: number): {
  waveCompleted: boolean;
  newLife: boolean;
  startNextWave: boolean;
} {
  let waveCompleted = false;
  let newLife = false;
  let startNextWave = false;

  if (state.transitionActive) {
    state.transitionTimer -= dt;
    if (state.transitionTimer <= 0) {
      state.transitionActive = false;
      state.wave += 1;
      state.waveActive = true;
      state.waveTimer = 0;
      state.waveDuration = getWaveDuration(state.wave);
      state.scoreAtWaveStart = currentScore;
      state.enemiesFleeing = false;
      state.fleeTimer = 0;
      startNextWave = true;

      // Extra life every 3 waves
      if (state.wave % 3 === 1 && state.wave > 1) {
        newLife = true;
      }
    }
    return { waveCompleted, newLife, startNextWave };
  }

  if (state.enemiesFleeing) {
    state.fleeTimer -= dt;
    if (state.fleeTimer <= 0) {
      state.transitionActive = true;
      state.transitionTimer = TRANSITION_DURATION;
      state.waveActive = false;
    }
    return { waveCompleted, newLife, startNextWave };
  }

  if (state.waveActive) {
    state.waveTimer += dt;
    const scoreInWave = currentScore - state.scoreAtWaveStart;
    const threshold = getWaveScoreThreshold(state.wave);
    const timeUp = state.waveTimer >= state.waveDuration;

    if (scoreInWave >= threshold || timeUp) {
      // Wave complete — enemies flee
      state.enemiesFleeing = true;
      state.fleeTimer = 3; // 3 seconds for enemies to fly away
      waveCompleted = true;
    }
  }

  return { waveCompleted, newLife, startNextWave };
}

export function drawWaveTransition(ctx: CanvasRenderingContext2D, state: WaveState, cw: number, ch: number) {
  if (!state.transitionActive) return;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, cw, ch);

  const alpha = Math.min((TRANSITION_DURATION - state.transitionTimer) * 2, 1) *
    Math.min(state.transitionTimer * 2, 1);

  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.fillStyle = "#f7d794";
  ctx.font = "bold 28px monospace";
  ctx.fillText(`WAVE ${state.wave} DRIVEN AWAY`, cw / 2, ch / 2 - 20);

  ctx.fillStyle = "#aaa";
  ctx.font = "bold 16px monospace";
  ctx.fillText("Prepare for next wave", cw / 2, ch / 2 + 20);

  // Show extra life message
  const nextWave = state.wave + 1;
  if (nextWave % 3 === 1 && nextWave > 1) {
    ctx.fillStyle = "#D93636";
    ctx.font = "bold 14px monospace";
    ctx.fillText("+ EXTRA LIFE", cw / 2, ch / 2 + 50);
  }

  ctx.restore();
}

export function drawWaveHUD(ctx: CanvasRenderingContext2D, state: WaveState, cw: number) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "bold 12px monospace";
  ctx.fillStyle = "#888";
  ctx.fillText(`WAVE ${state.wave}`, cw / 2, 50);
  ctx.restore();
}
