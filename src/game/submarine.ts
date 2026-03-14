/**
 * submarine.ts — Underwater Enemy System
 * 
 * Submarines are underwater threats that attack the city from below.
 * The player must dive underwater to intercept them.
 * 
 * Behavior:
 * 1. Submarines spawn far to the left or right, deep underwater
 * 2. They slowly approach the city at their spawn depth
 * 3. When directly beneath the city, they stop and begin charging
 * 4. After a charge timer (with visible warning flash), they detonate
 * 5. Detonation damages the city directly
 * 
 * Visual design: Dark gunmetal hull with crimson accents,
 * pulsing red "eye" porthole, jagged tail fins, and warning flash when attacking.
 */

import { getWaterSurfaceY } from "./water";
import { spawnExplosion } from "./enemies";

// ==================== INTERFACE ====================

/** A submarine enemy entity */
export interface Submarine {
  x: number;           // World X position
  y: number;           // World Y position (depth below water surface)
  speed: number;       // Horizontal movement speed
  dir: 1 | -1;         // Direction: 1 = moving right, -1 = moving left
  alive: boolean;
  attacking: boolean;  // true when positioned under city and charging
  attackTimer: number;  // Seconds remaining before detonation
  flashTimer: number;  // Accumulated time for attack warning animation
}

// ==================== MODULE STATE ====================

let submarines: Submarine[] = [];
let subSpawnTimer = 15;  // Countdown to first submarine spawn

// ==================== CONSTANTS ====================

const SUB_WIDTH = 50;       // Visual width of submarine
const SUB_HEIGHT = 16;      // Visual height of submarine
const SUB_SPEED = 0.6;      // Base horizontal speed (very slow, menacing)
const SUB_ATTACK_TIME = 2.0; // Seconds to charge before detonation
const SUB_DEPTH_MIN = 50;   // Minimum depth below water surface
const SUB_DEPTH_MAX = 140;  // Maximum depth (deeper subs require deeper dives)

// ==================== ACCESSORS & RESET ====================

export function getSubmarines() { return submarines; }

/** Reset submarine state. Called at game start and between waves. */
export function resetSubmarines() {
  submarines = [];
  subSpawnTimer = 15;
}

// ==================== UPDATE (simple version, unused) ====================

/**
 * Basic update function without damage return.
 * Kept for API compatibility but updateSubmarinesWithDamage is preferred.
 */
export function updateSubmarines(
  dt: number, viewH: number, boatX: number, boatWidth: number,
  playerX: number, viewHalfW: number, waveDifficulty: number,
  fleeing: boolean, gameTime: number
) {
  const waterY = getWaterSurfaceY(viewH);
  const hw = boatWidth / 2;

  // ---- Spawning ----
  if (!fleeing && gameTime > 20 / waveDifficulty) {
    subSpawnTimer -= dt;
    const maxSubs = Math.min(1 + Math.floor(waveDifficulty * 0.5), 3);
    const aliveSubs = submarines.filter(s => s.alive).length;
    if (subSpawnTimer <= 0 && aliveSubs < maxSubs) {
      subSpawnTimer = Math.max(18 - waveDifficulty * 3, 8) + Math.random() * 6;
      const fromLeft = Math.random() > 0.5;
      const dir = fromLeft ? 1 : -1;
      const spawnX = fromLeft
        ? boatX - hw - 600 - Math.random() * 400
        : boatX + hw + 600 + Math.random() * 400;
      const depthOffset = SUB_DEPTH_MIN + Math.random() * (SUB_DEPTH_MAX - SUB_DEPTH_MIN);
      submarines.push({
        x: spawnX,
        y: waterY + depthOffset,
        speed: SUB_SPEED + Math.random() * 0.2,
        dir: dir as 1 | -1,
        alive: true,
        attacking: false,
        attackTimer: 0,
        flashTimer: 0,
      });
    }
  }

  // ---- Movement & Attack ----
  for (const sub of submarines) {
    if (!sub.alive) continue;

    if (fleeing) {
      sub.attacking = false;
      sub.x -= sub.dir * 2.5;  // Reverse direction to flee
      if (Math.abs(sub.x - playerX) > viewHalfW * 4) sub.alive = false;
      continue;
    }

    if (!sub.attacking) {
      sub.x += sub.dir * sub.speed;

      // Check if underneath the city (within 60% of city width)
      if (sub.x > boatX - hw * 0.6 && sub.x < boatX + hw * 0.6) {
        sub.attacking = true;
        sub.attackTimer = SUB_ATTACK_TIME;
        sub.speed = 0;  // Stop moving while charging
      }

      // Despawn if way past the city
      if ((sub.dir === 1 && sub.x > boatX + hw + 800) ||
          (sub.dir === -1 && sub.x < boatX - hw - 800)) {
        sub.alive = false;
      }
    } else {
      // Charging attack — countdown to detonation
      sub.attackTimer -= dt;
      sub.flashTimer += dt;
      if (sub.attackTimer <= 0) {
        sub.alive = false;
        spawnExplosion(sub.x, waterY, 40);
      }
    }
  }

  submarines = submarines.filter(s => s.alive);
}

/** Unused — damage is handled by updateSubmarinesWithDamage instead */
export function checkSubmarineAttacks(boatX: number, boatWidth: number, viewH: number): number {
  return 0;
}

// ==================== UPDATE WITH DAMAGE RETURN ====================

/**
 * Main submarine update function. Same as updateSubmarines but returns
 * the amount of damage dealt to the city this frame.
 * 
 * @returns Number of submarine detonations (each deals 1 damage to city)
 */
export function updateSubmarinesWithDamage(
  dt: number, viewH: number, boatX: number, boatWidth: number,
  playerX: number, viewHalfW: number, waveDifficulty: number,
  fleeing: boolean, gameTime: number
): number {
  const waterY = getWaterSurfaceY(viewH);
  const hw = boatWidth / 2;
  let damage = 0;

  // ---- Spawning (same logic as above) ----
  if (!fleeing && gameTime > 20 / waveDifficulty) {
    subSpawnTimer -= dt;
    const maxSubs = Math.min(1 + Math.floor(waveDifficulty * 0.5), 3);
    const aliveSubs = submarines.filter(s => s.alive).length;
    if (subSpawnTimer <= 0 && aliveSubs < maxSubs) {
      subSpawnTimer = Math.max(18 - waveDifficulty * 3, 8) + Math.random() * 6;
      const fromLeft = Math.random() > 0.5;
      const dir = fromLeft ? 1 : -1;
      const spawnX = fromLeft
        ? boatX - hw - 600 - Math.random() * 400
        : boatX + hw + 600 + Math.random() * 400;
      const depthOffset = SUB_DEPTH_MIN + Math.random() * (SUB_DEPTH_MAX - SUB_DEPTH_MIN);
      submarines.push({
        x: spawnX,
        y: waterY + depthOffset,
        speed: SUB_SPEED + Math.random() * 0.2,
        dir: dir as 1 | -1,
        alive: true,
        attacking: false,
        attackTimer: 0,
        flashTimer: 0,
      });
    }
  }

  // ---- Movement & Attack ----
  for (const sub of submarines) {
    if (!sub.alive) continue;

    if (fleeing) {
      sub.attacking = false;
      sub.x -= sub.dir * 2.5;
      if (Math.abs(sub.x - playerX) > viewHalfW * 4) sub.alive = false;
      continue;
    }

    if (!sub.attacking) {
      sub.x += sub.dir * sub.speed;

      if (sub.x > boatX - hw * 0.6 && sub.x < boatX + hw * 0.6) {
        sub.attacking = true;
        sub.attackTimer = SUB_ATTACK_TIME;
        sub.speed = 0;
      }

      if ((sub.dir === 1 && sub.x > boatX + hw + 800) ||
          (sub.dir === -1 && sub.x < boatX - hw - 800)) {
        sub.alive = false;
      }
    } else {
      sub.attackTimer -= dt;
      sub.flashTimer += dt;
      if (sub.attackTimer <= 0) {
        sub.alive = false;
        spawnExplosion(sub.x, waterY, 40);
        damage += 1;  // Each detonation = 1 city damage
      }
    }
  }

  submarines = submarines.filter(s => s.alive);
  return damage;
}

// ==================== BULLET COLLISION ====================

/**
 * Check if any player bullets hit a submarine.
 * Submarines have a rectangular hitbox based on SUB_WIDTH × SUB_HEIGHT.
 * 
 * @returns Remaining bullets and total score earned from submarine kills
 */
export function checkBulletHitsSubmarine(bullets: { x: number; y: number; dx: number; dy: number; id: number }[]): { remaining: typeof bullets; score: number } {
  const remaining: typeof bullets = [];
  let score = 0;
  const SCORE_SUB = 200;  // Points per submarine destroyed

  for (const b of bullets) {
    let hit = false;
    for (const sub of submarines) {
      if (!sub.alive) continue;
      // Rectangular hitbox check
      if (Math.abs(b.x - sub.x) < SUB_WIDTH / 2 + 5 && Math.abs(b.y - sub.y) < SUB_HEIGHT / 2 + 5) {
        sub.alive = false;
        spawnExplosion(sub.x, sub.y, 35, SCORE_SUB);
        score += SCORE_SUB;
        hit = true;
        break;
      }
    }
    if (!hit) remaining.push(b);
  }

  return { remaining, score };
}

// ==================== RENDERING ====================

/**
 * Draws all submarines with their menacing visual design.
 * Called within a camera-translated context (world coordinates).
 * 
 * Visual elements:
 * - Dark gunmetal hull with crimson stripe
 * - Angular conning tower with sensor mast
 * - Armored ram nose
 * - Pulsing red "eye" porthole
 * - Jagged tail fins
 * - Torpedo tube markings
 * - Attack warning flash and rising red bubbles when charging
 */
export function drawSubmarines(ctx: CanvasRenderingContext2D) {
  for (const sub of submarines) {
    if (!sub.alive) continue;

    ctx.save();
    ctx.translate(sub.x, sub.y);

    const hw = SUB_WIDTH / 2;
    const hh = SUB_HEIGHT / 2;

    // Red glow — brighter when attacking
    ctx.shadowColor = sub.attacking ? "rgba(255, 30, 10, 0.7)" : "rgba(200, 50, 30, 0.4)";
    ctx.shadowBlur = 12;

    // ---- Main hull (elliptical, dark gunmetal) ----
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();
    ctx.strokeStyle = "#4a0e0e";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ---- Danger stripe (crimson band across center) ----
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.92, hh * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#6b0000";
    ctx.fill();

    // Inner hull (dark center)
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.75, hh * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();

    // ---- Conning tower (angular shape on top) ----
    ctx.beginPath();
    ctx.moveTo(-7, -hh);
    ctx.lineTo(-5, -hh - 9);
    ctx.lineTo(5, -hh - 9);
    ctx.lineTo(7, -hh);
    ctx.closePath();
    ctx.fillStyle = "#2d0a0a";
    ctx.fill();
    ctx.strokeStyle = "#8b0000";
    ctx.lineWidth = 1;
    ctx.stroke();

    // ---- Sensor mast (antenna with blinking red tip) ----
    ctx.beginPath();
    ctx.moveTo(0, -hh - 9);
    ctx.lineTo(0, -hh - 15);
    ctx.strokeStyle = "#cc0000";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    
    // Blinking sensor tip
    const sensorBlink = Math.sin(performance.now() * 0.008 + sub.x) > 0;
    if (sensorBlink) {
      ctx.beginPath();
      ctx.arc(0, -hh - 15, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff0000";
      ctx.fill();
    }

    // ---- Armored nose (triangular ram on front) ----
    const noseX = sub.dir * hw;
    ctx.beginPath();
    ctx.moveTo(noseX, -hh * 0.6);
    ctx.lineTo(noseX + sub.dir * 8, 0);
    ctx.lineTo(noseX, hh * 0.6);
    ctx.closePath();
    ctx.fillStyle = "#4a0e0e";
    ctx.fill();

    // ---- Hostile eye porthole (pulsing red circle) ----
    const eyeX = sub.dir * hw * 0.35;
    ctx.beginPath();
    ctx.arc(eyeX, 0, 3.5, 0, Math.PI * 2);
    const eyePulse = 0.6 + Math.sin(performance.now() * 0.006) * 0.4;
    ctx.fillStyle = sub.attacking ? "#ff0000" : `rgba(255, 40, 20, ${eyePulse})`;
    ctx.fill();
    // Bright pupil
    ctx.beginPath();
    ctx.arc(eyeX, 0, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffcc00";
    ctx.fill();

    // ---- Jagged tail fins ----
    const tailX = -sub.dir * hw * 0.85;
    ctx.beginPath();
    ctx.moveTo(tailX, -hh * 0.4);
    ctx.lineTo(tailX - sub.dir * 8, -hh - 5);
    ctx.lineTo(tailX - sub.dir * 4, -hh * 0.1);
    ctx.lineTo(tailX - sub.dir * 8, hh + 5);
    ctx.lineTo(tailX, hh * 0.4);
    ctx.closePath();
    ctx.fillStyle = "#6b0000";
    ctx.fill();

    // ---- Torpedo tube markings (small rectangles) ----
    const tubeX = sub.dir * hw * 0.6;
    ctx.fillStyle = "#333";
    ctx.fillRect(tubeX - 1, -hh * 0.5, 2, 3);
    ctx.fillRect(tubeX - 1, hh * 0.5 - 3, 2, 3);

    ctx.shadowColor = "transparent";

    // ---- Attack warning effects ----
    if (sub.attacking) {
      // Flashing red outline
      const flash = Math.sin(sub.flashTimer * 10) > 0;
      if (flash) {
        ctx.beginPath();
        ctx.ellipse(0, 0, hw + 6, hh + 6, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 0, 0, 0.7)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Rising red bubbles (indicate imminent detonation)
      for (let i = 0; i < 4; i++) {
        const bx = (i - 1.5) * 8 + Math.sin(sub.flashTimer * 4 + i) * 4;
        const by = -hh - 12 - ((sub.flashTimer * 35 + i * 12) % 50);
        ctx.beginPath();
        ctx.arc(bx, by, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 80, 50, ${0.3 + Math.random() * 0.3})`;
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

// ==================== WAVE FLEEING ====================

/** Make all submarines stop attacking and reverse direction */
export function fleeSubmarines() {
  for (const sub of submarines) {
    if (sub.alive) {
      sub.attacking = false;
    }
  }
}

/** Check if all submarines have fled or been destroyed */
export function areSubmarinesGone(): boolean {
  return submarines.filter(s => s.alive).length === 0;
}
