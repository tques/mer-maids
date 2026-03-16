/**
 * gunboat.ts — Gunboat Enemy System
 *
 * Armored surface vessel with a barrier dome that blocks attacks from above.
 * Can only be destroyed by shooting from below (underwater).
 * Features a rapid-fire turret with 180° aiming (lower hemisphere).
 * Spawns rarely compared to other enemies.
 *
 * Related modules:
 * - enemies.ts — Air enemies
 * - water.ts — Water surface positioning
 * - effects.ts — Explosions and score popups
 */

import { getWaterSurfaceY, getWaveY } from "./water";
import { spawnExplosion } from "./effects";

// ==================== INTERFACES ====================

export interface GunboatBullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  alive: boolean;
}

export interface Gunboat {
  x: number;
  hp: number;
  maxHP: number;
  speed: number;
  dir: 1 | -1;
  alive: boolean;
  shootCooldown: number;
  barrierFlash: number; // visual flash when barrier blocks a hit
}

// ==================== CONSTANTS ====================

const GUNBOAT_HP = 5;
const GUNBOAT_WIDTH = 50;
const GUNBOAT_HEIGHT = 18;
const GUNBOAT_SPEED = 0.8;
const GUNBOAT_SHOOT_INTERVAL = 0.35; // rapid fire
const GUNBOAT_BULLET_SPEED = 5;
const GUNBOAT_VISION_RANGE = 400;
const GUNBOAT_BARRIER_RADIUS = 38;
export const SCORE_GUNBOAT = 300;

// ==================== MODULE STATE ====================

let gunboats: Gunboat[] = [];
let gunboatBullets: GunboatBullet[] = [];
let gunboatSpawnTimer = 30; // first one spawns after 30s

// ==================== RESET & ACCESSORS ====================

export function resetGunboats() {
  gunboats = [];
  gunboatBullets = [];
  gunboatSpawnTimer = 30;
}

export function getGunboats() { return gunboats; }
export function getGunboatBullets() { return gunboatBullets; }

// ==================== COLLISION CHECKS ====================

/**
 * Check if gunboat bullets hit the player.
 * Returns hit count, destroys bullets on contact.
 */
export function checkGunboatBulletHitsPlayer(px: number, py: number, radius: number): number {
  let hits = 0;
  for (const b of gunboatBullets) {
    if (!b.alive) continue;
    if (Math.hypot(b.x - px, b.y - py) < radius + 3) {
      b.alive = false;
      hits++;
    }
  }
  return hits;
}

/**
 * Check player bullets against gunboats.
 * Only bullets coming from BELOW (bullet dy < 0, meaning traveling upward,
 * and bullet y > gunboat waterline) can damage them.
 * Bullets from above bounce off the barrier with a flash.
 * Returns remaining bullets and score.
 */
export function checkBulletHitsGunboat(
  bullets: { x: number; y: number; dx: number; dy: number; id: number }[],
  viewH: number,
): { remaining: typeof bullets; score: number } {
  const remaining: typeof bullets = [];
  let score = 0;
  const waterY = getWaterSurfaceY(viewH);

  for (const b of bullets) {
    let hit = false;

    for (const g of gunboats) {
      if (!g.alive) continue;

      const gy = getWaveY(g.x, waterY) - 8; // gunboat sits slightly above wave
      const dx = b.x - g.x;
      const dy = b.y - gy;
      const dist = Math.hypot(dx, dy);

      // Check barrier dome (upper hemisphere) — blocks shots from above
      if (dist < GUNBOAT_BARRIER_RADIUS && b.y < gy) {
        // Bullet hit the barrier — deflect
        g.barrierFlash = 0.3;
        hit = true;
        break;
      }

      // Check hull hit from below (bullet must be below waterline and traveling upward)
      const hullHitbox = Math.hypot(dx, b.y - (gy + GUNBOAT_HEIGHT / 2));
      if (hullHitbox < GUNBOAT_WIDTH / 2 + 5 && b.y > gy) {
        g.hp -= 1;
        hit = true;
        if (g.hp <= 0) {
          g.alive = false;
          spawnExplosion(g.x, gy, 45, SCORE_GUNBOAT);
          score += SCORE_GUNBOAT;
        } else {
          spawnExplosion(b.x, b.y, 10);
        }
        break;
      }
    }

    if (!hit) remaining.push(b);
  }

  return { remaining, score };
}

/**
 * Ram collision — gunboat barrier blocks rams from above too.
 * Only rams from below can damage. Returns score.
 */
export function checkRamGunboat(px: number, py: number, radius: number, viewH: number): number {
  let score = 0;
  const waterY = getWaterSurfaceY(viewH);

  for (const g of gunboats) {
    if (!g.alive) continue;
    const gy = getWaveY(g.x, waterY) - 8;
    const dist = Math.hypot(px - g.x, py - gy);

    if (dist < radius + GUNBOAT_WIDTH / 2) {
      if (py > gy) {
        // Ram from below — destroy instantly
        g.alive = false;
        spawnExplosion(g.x, gy, 45, SCORE_GUNBOAT);
        score += SCORE_GUNBOAT;
      } else {
        // Ram barrier from above — flash only
        g.barrierFlash = 0.3;
      }
    }
  }

  return score;
}

// ==================== FLEEING ====================

export function fleeGunboats() {
  for (const g of gunboats) {
    if (g.alive) {
      g.dir = g.x < 1500 ? -1 : 1;
      g.speed = 3;
      g.shootCooldown = 999;
    }
  }
}

export function areGunboatsGone(): boolean {
  return gunboats.filter(g => g.alive).length === 0;
}

// ==================== MAIN UPDATE ====================

export function updateGunboats(
  dt: number,
  worldWidth: number,
  viewH: number,
  playerX: number,
  playerY: number,
  viewHalfW: number,
  waveDifficulty: number,
  fleeing: boolean,
  cityX: number = worldWidth / 2,
  cityW: number = 400,
) {
  const waterY = getWaterSurfaceY(viewH);

  // ---- Spawning (rare — every 45-60s, max 2 alive) ----
  if (!fleeing) {
    gunboatSpawnTimer -= dt;
    const aliveCount = gunboats.filter(g => g.alive).length;
    const maxGunboats = Math.min(1 + Math.floor(waveDifficulty / 2), 3);

    if (gunboatSpawnTimer <= 0 && aliveCount < maxGunboats) {
      gunboatSpawnTimer = Math.max(45 - waveDifficulty * 5, 20) + Math.random() * 15;
      const fromLeft = Math.random() > 0.5;
      const spawnX = fromLeft
        ? playerX - viewHalfW - 300
        : playerX + viewHalfW + 300;
      gunboats.push({
        x: ((spawnX % worldWidth) + worldWidth) % worldWidth,
        hp: GUNBOAT_HP,
        maxHP: GUNBOAT_HP,
        speed: GUNBOAT_SPEED,
        dir: fromLeft ? 1 : -1,
        alive: true,
        shootCooldown: 1.5,
        barrierFlash: 0,
      });
    }
  }

  // ---- Update gunboats ----
  for (const g of gunboats) {
    if (!g.alive) continue;

    // Move along surface
    g.x += g.dir * g.speed;
    g.x = ((g.x % worldWidth) + worldWidth) % worldWidth;

    // Barrier flash decay
    if (g.barrierFlash > 0) g.barrierFlash -= dt;

    if (fleeing) {
      if (Math.abs(g.x - playerX) > viewHalfW * 4) g.alive = false;
      continue;
    }

    // Reverse at world edges occasionally
    if (Math.random() < 0.001) g.dir *= -1;

    // Reverse direction near platforms (city and depot)
    const DEPOT_X = worldWidth - 80;
    const DEPOT_HW = 60;
    const CITY_HW = cityW / 2;
    const PLATFORM_MARGIN = 80;

    // Near city — if inside the exclusion zone, reverse
    const cityLeft = cityX - CITY_HW - PLATFORM_MARGIN;
    const cityRight = cityX + CITY_HW + PLATFORM_MARGIN;
    if (g.x > cityLeft && g.x < cityRight) {
      // Push away from city center
      g.dir = g.x < cityX ? -1 : 1;
    }

    // Near depot — if inside the exclusion zone, reverse
    const depotLeft = DEPOT_X - DEPOT_HW - PLATFORM_MARGIN;
    const depotRight = DEPOT_X + DEPOT_HW + PLATFORM_MARGIN;
    if (g.x > depotLeft && g.x < depotRight) {
      g.dir = g.x < DEPOT_X ? -1 : 1;
    }

    // ---- Shooting (180° lower hemisphere toward player) ----
    const gy = getWaveY(g.x, waterY) - 8;
    const distToPlayer = Math.hypot(playerX - g.x, playerY - gy);

    g.shootCooldown -= dt;
    // Only fire if player is above water (not submerged)
    const playerAbove = playerY <= gy;
    if (g.shootCooldown <= 0 && distToPlayer < GUNBOAT_VISION_RANGE && playerAbove) {
      g.shootCooldown = GUNBOAT_SHOOT_INTERVAL;

      const aimAngle = Math.atan2(playerY - gy, playerX - g.x);
      // Clamp to upper hemisphere: -PI to 0 (left to right, above the boat)
      const finalAngle = Math.max(-Math.PI, Math.min(0, aimAngle));

      gunboatBullets.push({
        x: g.x + Math.cos(finalAngle) * 20,
        y: gy + Math.sin(finalAngle) * 10 - 5,
        dx: Math.cos(finalAngle) * GUNBOAT_BULLET_SPEED,
        dy: Math.sin(finalAngle) * GUNBOAT_BULLET_SPEED,
        alive: true,
      });
    }
  }

  // ---- Update bullets ----
  for (const b of gunboatBullets) {
    if (!b.alive) continue;
    b.x += b.dx;
    b.y += b.dy;
    if (b.y < -10 || b.y > viewH + 10 || Math.abs(b.x - playerX) > viewHalfW * 3) {
      b.alive = false;
    }
  }

  // ---- Cleanup ----
  gunboats = gunboats.filter(g => g.alive);
  gunboatBullets = gunboatBullets.filter(b => b.alive);
}

// ==================== RENDERING ====================

export function drawGunboats(ctx: CanvasRenderingContext2D, viewH: number) {
  const waterY = getWaterSurfaceY(viewH);

  for (const g of gunboats) {
    if (!g.alive) continue;

    const gy = getWaveY(g.x, waterY) - 8;
    const hw = GUNBOAT_WIDTH / 2;

    ctx.save();
    ctx.translate(g.x, gy);

    // ---- Submerged hull (dark industrial) ----
    ctx.beginPath();
    ctx.moveTo(-hw, 4);
    ctx.lineTo(-hw + 8, GUNBOAT_HEIGHT);
    ctx.lineTo(hw - 8, GUNBOAT_HEIGHT);
    ctx.lineTo(hw, 4);
    ctx.closePath();
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();

    // ---- Main hull (robotic dark metal) ----
    ctx.beginPath();
    ctx.moveTo(-hw - 4, 4);
    ctx.lineTo(-hw + 2, -4);
    ctx.lineTo(hw - 2, -4);
    ctx.lineTo(hw + 4, 4);
    ctx.closePath();
    const hullGrad = ctx.createLinearGradient(-hw, -4, hw, 4);
    hullGrad.addColorStop(0, "#2a2a2a");
    hullGrad.addColorStop(0.5, "#3a3a3a");
    hullGrad.addColorStop(1, "#2a2a2a");
    ctx.fillStyle = hullGrad;
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.stroke();

    // ---- Industrial panel lines ----
    ctx.strokeStyle = "rgba(120, 120, 120, 0.25)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.5, -4);
    ctx.lineTo(-hw * 0.5, 4);
    ctx.moveTo(hw * 0.5, -4);
    ctx.lineTo(hw * 0.5, 4);
    ctx.stroke();

    // ---- Deck / superstructure (dark robotic) ----
    ctx.fillStyle = "#333";
    ctx.fillRect(-10, -10, 20, 7);
    ctx.fillStyle = "#282828";
    ctx.fillRect(-8, -13, 16, 4);

    // Turret base (robotic red sensor)
    ctx.beginPath();
    ctx.arc(0, -6, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -6, 4, 0, Math.PI * 2);
    const turretPulse = 0.6 + Math.sin(performance.now() * 0.008) * 0.4;
    ctx.fillStyle = `rgba(255, 30, 0, ${turretPulse})`;
    ctx.fill();

    // Turret barrel
    ctx.save();
    ctx.translate(0, -6);
    const barrelAngle = g.dir === 1 ? -Math.PI * 0.35 : -Math.PI * 0.65;
    ctx.rotate(barrelAngle);
    ctx.fillStyle = "#444";
    ctx.fillRect(0, -1.5, 14, 3);
    ctx.restore();

    // ---- Danger markings (industrial hazard) ----
    ctx.fillStyle = "rgba(200, 50, 20, 0.4)";
    ctx.fillRect(-hw + 3, 0, 8, 4);
    ctx.fillRect(hw - 11, 0, 8, 4);

    // ---- Engine glow (alien red) ----
    const engineSide = g.dir === 1 ? -hw - 2 : hw + 2;
    ctx.beginPath();
    ctx.arc(engineSide, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 80, 20, ${0.4 + Math.sin(performance.now() * 0.01) * 0.3})`;
    ctx.fill();

    // ---- Barrier dome (upper hemisphere, always active) ----
    const barrierR = GUNBOAT_BARRIER_RADIUS;
    const flashAlpha = g.barrierFlash > 0 ? 0.5 : 0.12;
    const barrierPulse = 0.03 * Math.sin(performance.now() * 0.004);

    ctx.beginPath();
    ctx.arc(0, -2, barrierR, Math.PI, 0, false);
    ctx.closePath();
    const barrierColor = g.barrierFlash > 0
      ? `rgba(255, 80, 40, ${flashAlpha})`
      : `rgba(200, 50, 30, ${flashAlpha + barrierPulse})`;
    ctx.fillStyle = barrierColor;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, -2, barrierR, Math.PI, 0, false);
    const edgeAlpha = g.barrierFlash > 0 ? 0.8 : 0.3 + barrierPulse * 3;
    ctx.strokeStyle = `rgba(200, 50, 30, ${edgeAlpha})`;
    ctx.lineWidth = g.barrierFlash > 0 ? 2.5 : 1.5;
    ctx.stroke();

    // Industrial hex pattern
    if (g.barrierFlash <= 0) {
      ctx.globalAlpha = 0.06;
      for (let a = Math.PI; a < Math.PI * 2; a += Math.PI / 6) {
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(Math.cos(a) * barrierR, -2 + Math.sin(a) * barrierR);
        ctx.strokeStyle = "#ff3300";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ---- HP indicator (small pips below hull) ----
    const pipSize = 3;
    const pipSpacing = 8;
    const pipStartX = -((g.maxHP - 1) * pipSpacing) / 2;
    for (let i = 0; i < g.maxHP; i++) {
      ctx.beginPath();
      ctx.arc(pipStartX + i * pipSpacing, GUNBOAT_HEIGHT + 6, pipSize, 0, Math.PI * 2);
      ctx.fillStyle = i < g.hp ? "#e74c3c" : "rgba(100,100,100,0.4)";
      ctx.fill();
    }

    ctx.restore();
  }

  // ---- Gunboat bullets (fiery orange-red) ----
  for (const b of gunboatBullets) {
    if (!b.alive) continue;
    const bAngle = Math.atan2(b.dy, b.dx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(bAngle);
    // Glow
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -3);
    ctx.lineTo(-6, 3);
    ctx.closePath();
    ctx.fillStyle = "rgba(231, 76, 60, 0.3)";
    ctx.fill();
    // Body
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-4, -2);
    ctx.lineTo(-4, 2);
    ctx.closePath();
    ctx.fillStyle = "#e74c3c";
    ctx.fill();
    // Core
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-2, -1);
    ctx.lineTo(-2, 1);
    ctx.closePath();
    ctx.fillStyle = "#fab1a0";
    ctx.fill();
    ctx.restore();
  }
}
