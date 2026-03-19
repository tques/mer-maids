/**
 * effects.ts — Visual Effects System
 *
 * Shared visual effects used across all combat systems:
 *
 * 1. **Explosions** — Expanding orange/white circles that fade out.
 *    Spawned when enemies, missiles, bombs, or submarines are destroyed.
 *
 * 2. **Score Popups** — Floating "+N" text that drifts upward and fades.
 *    Appears at the location of destroyed enemies to show points earned.
 *
 * Both effect types are purely visual — they don't affect gameplay.
 * Any module can spawn effects via spawnExplosion().
 *
 * PERFORMANCE OPTIMIZATIONS (vs original):
 * - updateEffects uses in-place reverse-splice instead of Array.filter so no
 *   new array is allocated every frame, reducing GC pressure.
 */

// ==================== INTERFACES ====================

/** A visual explosion effect (expanding circle that fades) */
export interface Explosion {
  x: number;
  y: number;
  life: number; // Remaining life (1.0 → 0.0)
  maxLife: number; // Total lifetime in seconds
  radius: number; // Current visual radius
  maxRadius: number; // Maximum size
}

/** Floating score text that appears when enemies are destroyed */
export interface ScorePopup {
  x: number;
  y: number;
  value: number; // Score amount to display (e.g. 150)
  life: number; // Remaining life (1.0 → 0.0)
}

// ==================== MODULE STATE ====================

let explosions: Explosion[] = [];
let scorePopups: ScorePopup[] = [];

// ==================== RESET & ACCESSORS ====================

/** Reset all effects. Called at game start and between waves. */
export function resetEffects() {
  explosions = [];
  scorePopups = [];
}

/** Get the current list of active explosions */
export function getExplosions() {
  return explosions;
}

/** Get the current list of active score popups */
export function getScorePopups() {
  return scorePopups;
}

// ==================== SPAWNING ====================

/**
 * Create a visual explosion and optional score popup.
 *
 * Called by any combat system when something is destroyed:
 * - enemies.ts: bomber, chaser, bomb, missile kills
 * - submarine.ts: submarine kills and detonations
 *
 * @param x - World X position
 * @param y - World Y position
 * @param size - Maximum explosion radius (default 30)
 * @param scoreValue - If provided, shows floating "+N" text
 */
export function spawnExplosion(x: number, y: number, size = 30, scoreValue?: number) {
  explosions.push({
    x,
    y,
    life: 1,
    maxLife: 0.5,
    radius: 4,
    maxRadius: size,
  });
  if (scoreValue && scoreValue > 0) {
    scorePopups.push({ x, y, value: scoreValue, life: 1.0 });
  }
}

// ==================== UPDATE ====================

/**
 * Update all effects each frame.
 * Explosions expand toward max radius and fade out.
 * Score popups float upward and fade out.
 *
 * @param dt - Delta time in seconds
 *
 * PERF: Uses in-place reverse-splice instead of Array.filter to avoid
 * allocating a new array every frame and triggering GC.
 */
export function updateEffects(dt: number) {
  // ---- Explosions: expand and fade ----
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    ex.life -= dt / ex.maxLife;
    ex.radius += (ex.maxRadius - ex.radius) * 0.15; // Ease toward max size
    if (ex.life <= 0) explosions.splice(i, 1);
  }

  // ---- Score popups: float up and fade ----
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const sp = scorePopups[i];
    sp.life -= dt * 1.2;
    sp.y -= 0.8; // Float upward
    if (sp.life <= 0) scorePopups.splice(i, 1);
  }
}

// ==================== RENDERING ====================

/**
 * Draw all active effects.
 * Called within a camera-translated context (world coordinates).
 *
 * Explosions render as expanding orange circles with bright white cores.
 * Score popups render as floating gold "+N" text.
 */
export function drawEffects(ctx: CanvasRenderingContext2D) {
  // ---- Explosions (expanding orange/white circles) ----
  for (const ex of explosions) {
    ctx.save();
    ctx.globalAlpha = ex.life;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 165, 50, ${ex.life * 0.6})`;
    ctx.fill();
    // Bright inner core
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 200, ${ex.life * 0.8})`;
    ctx.fill();
    ctx.restore();
  }

  // ---- Score Popups (floating "+N" text) ----
  for (const sp of scorePopups) {
    ctx.save();
    ctx.globalAlpha = Math.min(sp.life * 2, 1);
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f7d794";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 4;
    ctx.fillText(`+${sp.value}`, sp.x, sp.y);
    ctx.restore();
  }
}
