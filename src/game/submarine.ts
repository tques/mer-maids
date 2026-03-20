/**
 * submarine.ts — Underwater Enemy System
 *
 * Submarines are underwater threats that attack cities from below.
 * The player must dive underwater to intercept them.
 *
 * Behavior:
 * 1. Submarines spawn far to the left or right, deep underwater
 * 2. They slowly approach the target city at their spawn depth
 * 3. When directly beneath the city, they stop and begin charging
 * 4. After a charge timer (with visible warning flash), they detonate
 * 5. Detonation damages the city directly
 *
 * Target city is set each wave via setSubmarineTargetCity(), always
 * guaranteed to be different from the bomber target city.
 */

import { getWaterSurfaceY } from "./water";
import { spawnExplosion } from "./effects";

// ==================== INTERFACE ====================

/** A submarine enemy entity */
export interface Submarine {
  x: number;
  y: number;
  targetY: number;
  speed: number;
  dir: 1 | -1;
  alive: boolean;
  attacking: boolean;
  attackTimer: number;
  flashTimer: number;
}

// ==================== MODULE STATE ====================

let submarines: Submarine[] = [];
let subSpawnTimer = 30;

/** Which city index submarines are targeting this wave */
let subTargetCityIndex = 1;

// ==================== CONSTANTS ====================

const SUB_WIDTH = 50;
const SUB_HEIGHT = 16;
const SUB_SPEED = 0.35;
const SUB_ATTACK_TIME = 4.5;
const SUB_DEPTH_MIN = 50;
const SUB_DEPTH_MAX = 140;
const SUB_SPAWN_DEPTH = 350;
const SUB_RISE_SPEED = 0.4;

// ==================== ACCESSORS & RESET ====================

export function getSubmarines() {
  return submarines;
}

export function setSubmarineTargetCity(index: number) {
  subTargetCityIndex = index;
}

export function getSubmarineTargetCityIndex() {
  return subTargetCityIndex;
}

/** Reset submarine state. Called at game start and between waves. */
export function resetSubmarines() {
  submarines = [];
  subSpawnTimer = 30;
}

// ==================== UPDATE WITH DAMAGE RETURN ====================

/**
 * Main submarine update. Accepts full cities array and uses
 * subTargetCityIndex to pick the target city.
 *
 * @returns Total damage dealt to the target city this frame
 */
export function updateSubmarinesWithDamage(
  dt: number,
  viewH: number,
  cities: { x: number; width: number }[],
  playerX: number,
  viewHalfW: number,
  waveDifficulty: number,
  fleeing: boolean,
  gameTime: number,
): number {
  const waterY = getWaterSurfaceY(viewH);

  // Resolve target city (fall back to index 0 if out of range)
  const targetCity = cities[subTargetCityIndex] ?? cities[0];
  const boatX = targetCity.x;
  const boatWidth = targetCity.width;
  const hw = boatWidth / 2;

  let damage = 0;

  // ---- Spawning ----
  if (!fleeing && gameTime > 20 / waveDifficulty) {
    subSpawnTimer -= dt;
    const maxSubs = 1;
    const aliveSubs = submarines.filter((s) => s.alive).length;
    if (subSpawnTimer <= 0 && aliveSubs < maxSubs) {
      subSpawnTimer = Math.max(35 - waveDifficulty * 2, 20) + Math.random() * 10;
      const fromLeft = Math.random() > 0.5;
      const dir = fromLeft ? 1 : -1;
      const spawnX = fromLeft ? boatX - hw - 600 - Math.random() * 400 : boatX + hw + 600 + Math.random() * 400;
      const depthOffset = SUB_DEPTH_MIN + Math.random() * (SUB_DEPTH_MAX - SUB_DEPTH_MIN);
      submarines.push({
        x: spawnX,
        y: waterY + SUB_SPAWN_DEPTH,
        targetY: waterY + depthOffset,
        speed: SUB_SPEED + Math.random() * 0.1,
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

    // Rise toward target depth
    if (sub.y > sub.targetY) {
      sub.y -= SUB_RISE_SPEED;
      if (sub.y < sub.targetY) sub.y = sub.targetY;
    }

    if (!sub.attacking) {
      sub.x += sub.dir * sub.speed;

      if (sub.x > boatX - hw * 0.6 && sub.x < boatX + hw * 0.6) {
        sub.attacking = true;
        sub.attackTimer = SUB_ATTACK_TIME;
        sub.speed = 0;
      }

      if ((sub.dir === 1 && sub.x > boatX + hw + 800) || (sub.dir === -1 && sub.x < boatX - hw - 800)) {
        sub.alive = false;
      }
    } else {
      sub.attackTimer -= dt;
      sub.flashTimer += dt;
      if (sub.attackTimer <= 0) {
        sub.alive = false;
        spawnExplosion(sub.x, waterY, 40);
        damage += 3;
      }
    }
  }

  submarines = submarines.filter((s) => s.alive);
  return damage;
}

// ==================== BULLET COLLISION ====================

export function checkBulletHitsSubmarine(bullets: { x: number; y: number; dx: number; dy: number; id: number }[]): {
  remaining: typeof bullets;
  score: number;
} {
  const remaining: typeof bullets = [];
  let score = 0;
  const SCORE_SUB = 200;

  for (const b of bullets) {
    let hit = false;
    for (const sub of submarines) {
      if (!sub.alive) continue;
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

export function drawSubmarines(ctx: CanvasRenderingContext2D) {
  for (const sub of submarines) {
    if (!sub.alive) continue;

    ctx.save();
    ctx.translate(sub.x, sub.y);

    const hw = SUB_WIDTH / 2;
    const hh = SUB_HEIGHT / 2;

    // Main hull
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    const hullGrad = ctx.createLinearGradient(0, -hh, 0, hh);
    hullGrad.addColorStop(0, "#2a2a2a");
    hullGrad.addColorStop(0.5, "#151515");
    hullGrad.addColorStop(1, "#1a1a1a");
    ctx.fillStyle = hullGrad;
    ctx.fill();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Panel segments
    ctx.strokeStyle = "rgba(100, 100, 100, 0.25)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.5, -hh);
    ctx.lineTo(-hw * 0.5, hh);
    ctx.moveTo(hw * 0.2, -hh);
    ctx.lineTo(hw * 0.2, hh);
    ctx.stroke();

    // Danger stripe
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.92, hh * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#5a0000";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.75, hh * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#151515";
    ctx.fill();

    // Conning tower
    ctx.beginPath();
    ctx.moveTo(-8, -hh);
    ctx.lineTo(-6, -hh - 10);
    ctx.lineTo(6, -hh - 10);
    ctx.lineTo(8, -hh);
    ctx.closePath();
    ctx.fillStyle = "#222";
    ctx.fill();
    ctx.strokeStyle = "#600";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Sensor mast
    ctx.beginPath();
    ctx.moveTo(0, -hh - 10);
    ctx.lineTo(0, -hh - 16);
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const sensorBlink = Math.sin(performance.now() * 0.008 + sub.x) > 0;
    if (sensorBlink) {
      ctx.beginPath();
      ctx.arc(0, -hh - 16, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff0000";
      ctx.fill();
    }

    // Armored nose
    const noseX = sub.dir * hw;
    ctx.beginPath();
    ctx.moveTo(noseX, -hh * 0.6);
    ctx.lineTo(noseX + sub.dir * 10, 0);
    ctx.lineTo(noseX, hh * 0.6);
    ctx.closePath();
    ctx.fillStyle = "#333";
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Hostile eye
    const eyeX = sub.dir * hw * 0.35;
    ctx.beginPath();
    ctx.arc(eyeX, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX, 0, 3, 0, Math.PI * 2);
    const eyePulse = 0.6 + Math.sin(performance.now() * 0.006) * 0.4;
    ctx.fillStyle = sub.attacking ? "#ff0000" : `rgba(255, 30, 10, ${eyePulse})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX, 0, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Tail fins
    const tailX = -sub.dir * hw * 0.85;
    ctx.beginPath();
    ctx.moveTo(tailX, -hh * 0.4);
    ctx.lineTo(tailX - sub.dir * 9, -hh - 6);
    ctx.lineTo(tailX - sub.dir * 5, -hh * 0.1);
    ctx.lineTo(tailX - sub.dir * 9, hh + 6);
    ctx.lineTo(tailX, hh * 0.4);
    ctx.closePath();
    ctx.fillStyle = "#3a0000";
    ctx.fill();

    // Torpedo tubes
    const tubeX = sub.dir * hw * 0.6;
    ctx.fillStyle = "#333";
    ctx.fillRect(tubeX - 1, -hh * 0.5, 2, 3);
    ctx.fillRect(tubeX - 1, hh * 0.5 - 3, 2, 3);

    // Attack warning
    if (sub.attacking) {
      const flash = Math.sin(sub.flashTimer * 10) > 0;
      if (flash) {
        ctx.beginPath();
        ctx.ellipse(0, 0, hw + 6, hh + 6, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 0, 0, 0.7)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
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

export function fleeSubmarines() {
  for (const sub of submarines) {
    if (sub.alive) {
      sub.attacking = false;
    }
  }
}

export function areSubmarinesGone(): boolean {
  return submarines.filter((s) => s.alive).length === 0;
}
