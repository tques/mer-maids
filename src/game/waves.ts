/**
 * waves.ts — Wave Progression System
 * 
 * The game is divided into waves of increasing difficulty.
 * Each wave has:
 * - A score threshold (earn enough points to complete the wave)
 * - A time limit (wave auto-completes after a duration)
 * - A difficulty multiplier (affects enemy spawn rates and counts)
 * 
 * Wave lifecycle:
 * 1. ACTIVE: Enemies spawn and attack normally
 * 2. FLEEING: Wave completed — enemies flee the screen (3 seconds)
 * 3. TRANSITION: "Wave Complete" overlay (4 seconds)
 * 4. NEXT WAVE: Reset enemies, increment wave counter, repeat
 * 
 * Every 3 waves, the player earns an extra life.
 */

// ==================== INTERFACE ====================

/** The complete state of the wave system */
export interface WaveState {
  wave: number;            // Current wave number (starts at 1)
  waveActive: boolean;     // true during normal gameplay
  waveTimer: number;       // Seconds elapsed in current wave
  waveDuration: number;    // Maximum seconds for this wave
  transitionTimer: number; // Countdown during transition screen
  transitionActive: boolean; // true during "wave complete" overlay
  scoreAtWaveStart: number; // Player's score when this wave began
  enemiesFleeing: boolean;  // true during the flee phase
  fleeTimer: number;       // Seconds remaining in flee phase
}

// ==================== CONSTANTS ====================

/** Base duration for wave 1 in seconds */
const BASE_WAVE_DURATION = 120; // 2 minutes

/** Duration of the transition screen between waves */
const TRANSITION_DURATION = 4;  // 4 seconds

// ==================== INITIALIZATION ====================

/** Create initial wave state for a new game */
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

// ==================== DIFFICULTY SCALING ====================

/**
 * Calculate how long a wave lasts.
 * Each wave is progressively longer:
 * Wave 1: 120s, Wave 2: 137s, Wave 3: 158s, Wave 4: 183s, ...
 * 
 * Formula: BASE + (wave-1)*15 + (wave-1)²*2
 */
export function getWaveDuration(wave: number): number {
  return BASE_WAVE_DURATION + (wave - 1) * 15 + Math.floor((wave - 1) * (wave - 1) * 2);
}

/**
 * Returns a difficulty multiplier for the current wave.
 * Used to scale enemy spawn rates and maximum counts.
 * 
 * Wave 1 = 1.0, Wave 2 = 1.3, Wave 3 = 1.6, Wave 4 = 1.9, ...
 */
export function getWaveDifficulty(wave: number): number {
  return 1.0 + (wave - 1) * 0.3;
}

/**
 * Score threshold needed to complete a wave.
 * The player must earn this many points *within the current wave*
 * (relative to their score at wave start).
 * 
 * Wave 1: 600, Wave 2: 1100, Wave 3: 1800, Wave 4: 2700, ...
 * 
 * Formula: 300 + wave*200 + wave²*100
 */
export function getWaveScoreThreshold(wave: number): number {
  return 300 + wave * 200 + Math.floor(wave * wave * 100);
}

// ==================== MAIN UPDATE ====================

/**
 * Update the wave system each frame.
 * Returns flags indicating what happened:
 * - waveCompleted: The current wave just ended (trigger enemy flee)
 * - newLife: An extra life was awarded (every 3 waves)
 * - startNextWave: A new wave just started (reset enemies)
 * 
 * @param state - The mutable wave state object
 * @param dt - Delta time in seconds
 * @param currentScore - Player's current total score
 */
export function updateWave(state: WaveState, dt: number, currentScore: number): {
  waveCompleted: boolean;
  newLife: boolean;
  startNextWave: boolean;
} {
  let waveCompleted = false;
  let newLife = false;
  let startNextWave = false;

  // ---- TRANSITION PHASE (between waves) ----
  if (state.transitionActive) {
    state.transitionTimer -= dt;
    if (state.transitionTimer <= 0) {
      // Transition over — start next wave
      state.transitionActive = false;
      state.wave += 1;
      state.waveActive = true;
      state.waveTimer = 0;
      state.waveDuration = getWaveDuration(state.wave);
      state.scoreAtWaveStart = currentScore;
      state.enemiesFleeing = false;
      state.fleeTimer = 0;
      startNextWave = true;

      // Extra life every 3 waves (wave 4, 7, 10, ...)
      if (state.wave % 3 === 1 && state.wave > 1) {
        newLife = true;
      }
    }
    return { waveCompleted, newLife, startNextWave };
  }

  // ---- FLEE PHASE (enemies leaving screen) ----
  if (state.enemiesFleeing) {
    state.fleeTimer -= dt;
    if (state.fleeTimer <= 0) {
      // Flee period over — show transition screen
      state.transitionActive = true;
      state.transitionTimer = TRANSITION_DURATION;
      state.waveActive = false;
    }
    return { waveCompleted, newLife, startNextWave };
  }

  // ---- ACTIVE WAVE ----
  if (state.waveActive) {
    state.waveTimer += dt;
    
    // Check completion conditions
    const scoreInWave = currentScore - state.scoreAtWaveStart;
    const threshold = getWaveScoreThreshold(state.wave);
    const timeUp = state.waveTimer >= state.waveDuration;

    if (scoreInWave >= threshold || timeUp) {
      // Wave complete! Start flee phase
      state.enemiesFleeing = true;
      state.fleeTimer = 3; // 3 seconds for enemies to fly away
      waveCompleted = true;
    }
  }

  return { waveCompleted, newLife, startNextWave };
}

// ==================== RENDERING ====================

/**
 * Draw the "Wave Complete" transition overlay.
 * Shows wave number, preparation message, and extra life indicator.
 * Fades in and out smoothly using the transition timer.
 */
export function drawWaveTransition(ctx: CanvasRenderingContext2D, state: WaveState, cw: number, ch: number) {
  if (!state.transitionActive) return;

  ctx.save();
  
  // Semi-transparent overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, cw, ch);

  // Fade in/out based on transition timer
  const alpha = Math.min((TRANSITION_DURATION - state.transitionTimer) * 2, 1) *
    Math.min(state.transitionTimer * 2, 1);

  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  
  // "WAVE N DRIVEN AWAY" header
  ctx.fillStyle = "#f7d794";
  ctx.font = "bold 28px monospace";
  ctx.fillText(`WAVE ${state.wave} DRIVEN AWAY`, cw / 2, ch / 2 - 20);

  // Subtitle
  ctx.fillStyle = "#aaa";
  ctx.font = "bold 16px monospace";
  ctx.fillText("Prepare for next wave", cw / 2, ch / 2 + 20);

  // Extra life notification (if applicable)
  const nextWave = state.wave + 1;
  if (nextWave % 3 === 1 && nextWave > 1) {
    ctx.fillStyle = "#D93636";
    ctx.font = "bold 14px monospace";
    ctx.fillText("+ EXTRA LIFE", cw / 2, ch / 2 + 50);
  }

  ctx.restore();
}

/**
 * Draw the wave number indicator in the top-center HUD.
 * Simple "WAVE N" text displayed at all times during gameplay.
 */
export function drawWaveHUD(ctx: CanvasRenderingContext2D, state: WaveState, cw: number) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "bold 12px monospace";
  ctx.fillStyle = "#888";
  ctx.fillText(`WAVE ${state.wave}`, cw / 2, 50);
  ctx.restore();
}
