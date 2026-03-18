/**
 * minelayer.ts — Mine-Layer Plane & Floating Mines
 *
 * A fast plane that flies across the map edge-to-edge, dropping naval mines.
 * Mines have buoyancy — they sink initially then float on the water surface.
 * Mines never despawn. Players can shoot them (explosion + score) but touching
 * one deals 1 damage to the player.
 */

import { getWaterSurfaceY, getWaveY } from "./water";
import { spawnExplosion } from "./effects";

// ==================== INTERFACES ====================

export interface MinelayerPlane {
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  dropCooldown: number;
  alive: boolean;
}

export interface Mine {
  x: number;
  y: number;
  vy: number;        // vertical velocity (sinking then floating)
  settled: boolean;   // true once floating on surface
  alive: boolean;
  age: number;        // seconds since spawn (for despawn logic)
}

// ==================== MODULE STATE ====================

let planes: MinelayerPlane[] = [];
let mines: Mine[] = [];
let spawnTimer = 0;
let gameTime = 0;

// ==================== CONSTANTS ====================

const PLANE_SPEED = 5;          // Fast — crosses map quickly
const PLANE_Y = 25;             // Flies high
const DROP_INTERVAL = 1.2;      // Seconds between mine drops
const MINE_SIZE = 18;           // Similar to player ship (~TRI_SIZE)
const MINE_SINK_SPEED = 0.8;    // Initial sinking speed
const MINE_BUOYANCY = 0.04;     // Upward force in water
const SCORE_MINE = 50;
const SCORE_MINELAYER = 250;    // Shooting down the plane
const PLANE_SIZE = 14;          // Collision radius
const FIRST_SPAWN_DELAY = 45;   // Seconds before first minelayer
const SPAWN_INTERVAL_MIN = 50;
const SPAWN_INTERVAL_MAX = 80;
const KILL_SPAWN_PENALTY = 30;  // Extra seconds added to spawn timer on kill

// ==================== RESET & ACCESSORS ====================

export function resetMinelayer() {
  planes = [];
  mines = [];
  spawnTimer = FIRST_SPAWN_DELAY;
  gameTime = 0;
}

export function getMines() { return mines; }
export function getPlanes() { return planes; }

/**
 * Check if a deflected missile hits any mines or minelayer planes.
 * Returns score earned and sets hit entity to dead.
 */
export function checkMissileHitsMineOrPlane(mx: number, my: number): { hit: boolean; score: number } {
  // Check planes
  for (const p of planes) {
    if (!p.alive) continue;
    if (Math.hypot(mx - p.x, my - p.y) < PLANE_SIZE + 6) {
      p.alive = false;
      spawnExplosion(p.x, p.y, 40, SCORE_MINELAYER);
      spawnTimer += KILL_SPAWN_PENALTY;
      return { hit: true, score: SCORE_MINELAYER };
    }
  }
  // Check mines
  for (const m of mines) {
    if (!m.alive) continue;
    if (Math.hypot(mx - m.x, my - m.y) < MINE_SIZE * 0.6 + 6) {
      m.alive = false;
      spawnExplosion(m.x, m.y, 40, SCORE_MINE);
      return { hit: true, score: SCORE_MINE };
    }
  }
  return { hit: false, score: 0 };
}

// ==================== UPDATE ====================

export function updateMinelayer(
  dt: number,
  worldWidth: number,
  viewH: number,
  waveDifficulty: number,
  fleeing: boolean,
  platforms?: { x: number; halfW: number; topY: number; bottomY: number }[],
) {
  const waterY = getWaterSurfaceY(viewH);
  gameTime += dt;

  // ---- Spawn planes ----
  if (!fleeing) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && gameTime > FIRST_SPAWN_DELAY / waveDifficulty) {
      spawnTimer = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
      const fromLeft = Math.random() > 0.5;
      planes.push({
        x: fromLeft ? -50 : worldWidth + 50,
        y: PLANE_Y + Math.random() * 20,
        dir: fromLeft ? 1 : -1,
        speed: PLANE_SPEED + Math.random() * 1.5,
        dropCooldown: 0.5 + Math.random() * 0.5,
        alive: true,
      });
    }
  }

  // ---- Update planes ----
  for (const p of planes) {
    if (!p.alive) continue;
    p.x += p.dir * p.speed;
    // Drop mines periodically
    p.dropCooldown -= dt;
    if (p.dropCooldown <= 0) {
      p.dropCooldown = DROP_INTERVAL + Math.random() * 0.4;
      mines.push({
        x: p.x,
        y: p.y + 10,
        vy: MINE_SINK_SPEED,
        settled: false,
        alive: true,
      });
    }
    // Despawn when off the other side
    if (p.x < -100 || p.x > worldWidth + 100) p.alive = false;
  }

  // ---- Update mines (buoyancy physics + platform clamping) ----
  for (const m of mines) {
    if (!m.alive) continue;
    if (!m.settled) {
      const surfaceY = getWaveY(m.x, waterY, worldWidth);
      if (m.y < surfaceY) {
        // Above water — fall
        m.vy += 0.02;
        m.y += m.vy;
      } else {
        // In water — buoyancy slows and reverses
        m.vy -= MINE_BUOYANCY;
        m.vy *= 0.92; // damping
        m.y += m.vy;
        // Settle when velocity is tiny and near surface
        if (Math.abs(m.vy) < 0.05 && Math.abs(m.y - surfaceY) < 2) {
          m.settled = true;
          m.y = surfaceY;
        }
      }
    } else {
      // Float on surface following waves
      m.y = getWaveY(m.x, waterY, worldWidth);
    }

    // Clamp mines below platforms — trap them underneath
    if (platforms) {
      for (const p of platforms) {
        if (m.x > p.x - p.halfW && m.x < p.x + p.halfW) {
          if (m.y < p.bottomY && m.y > p.topY - MINE_SIZE) {
            // Mine is rising into platform bottom — trap it below
            m.y = p.bottomY + 1;
            m.vy = Math.max(m.vy, 0); // Stop upward motion
            m.settled = false; // Keep it sinking/floating below
          }
        }
      }
    }
  }

  // Cleanup dead planes (mines persist!)
  planes = planes.filter(p => p.alive);
}

// ==================== COLLISION: PLAYER BULLETS vs MINES & PLANES ====================

export function checkBulletHitsMine(
  bullets: { x: number; y: number; dx: number; dy: number; id: number }[]
): { remaining: typeof bullets; score: number } {
  const remaining: typeof bullets = [];
  let score = 0;

  for (const b of bullets) {
    let hit = false;

    // Check vs minelayer planes
    for (const p of planes) {
      if (!p.alive) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) < PLANE_SIZE + 5) {
        p.alive = false;
        spawnExplosion(p.x, p.y, 40, SCORE_MINELAYER);
        score += SCORE_MINELAYER;
        // Penalize next spawn timer so they come back slower
        spawnTimer += KILL_SPAWN_PENALTY;
        hit = true;
        break;
      }
    }

    // Check vs mines
    if (!hit) {
      for (const m of mines) {
        if (!m.alive) continue;
        if (Math.hypot(b.x - m.x, b.y - m.y) < MINE_SIZE * 0.6 + 5) {
          m.alive = false;
          spawnExplosion(m.x, m.y, 40, SCORE_MINE);
          score += SCORE_MINE;
          hit = true;
          break;
        }
      }
    }

    if (!hit) remaining.push(b);
  }

  return { remaining, score };
}

// ==================== COLLISION: PLAYER TOUCH MINE ====================

export function checkMineHitsPlayer(px: number, py: number, radius: number): number {
  let hits = 0;
  for (const m of mines) {
    if (!m.alive) continue;
    if (Math.hypot(m.x - px, m.y - py) < MINE_SIZE * 0.6 + radius) {
      m.alive = false;
      spawnExplosion(m.x, m.y, 45);
      hits++;
    }
  }
  return hits;
}

// ==================== COLLISION: RAM MINES & PLANES ====================

export function checkRamMine(px: number, py: number, radius: number): number {
  let score = 0;
  const ramRadius = radius * 1.3;

  // Ram planes
  for (const p of planes) {
    if (!p.alive) continue;
    if (Math.hypot(p.x - px, p.y - py) < ramRadius + PLANE_SIZE) {
      p.alive = false;
      spawnExplosion(p.x, p.y, 40, SCORE_MINELAYER);
      score += SCORE_MINELAYER;
      spawnTimer += KILL_SPAWN_PENALTY;
    }
  }

  // Ram mines
  for (const m of mines) {
    if (!m.alive) continue;
    if (Math.hypot(m.x - px, m.y - py) < ramRadius + MINE_SIZE * 0.6) {
      m.alive = false;
      spawnExplosion(m.x, m.y, 40, SCORE_MINE);
      score += SCORE_MINE;
    }
  }

  return score;
}

// ==================== FLEE ====================

export function fleeMinelayers() {
  for (const p of planes) {
    p.speed = 8;
    p.dropCooldown = 999;
  }
}

// ==================== RENDERING ====================

export function drawMinelayer(ctx: CanvasRenderingContext2D, viewH: number) {
  // ---- Minelayer planes (dark industrial, alien bombers) ----
  for (const p of planes) {
    if (!p.alive) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.dir, 1);

    ctx.shadowColor = "rgba(200, 60, 0, 0.4)";
    ctx.shadowBlur = 8;

    const s = 14;
    // Dark industrial fuselage
    ctx.beginPath();
    ctx.moveTo(s * 1.3, 0);
    ctx.lineTo(s * 0.3, -s * 0.45);
    ctx.lineTo(-s * 0.7, -s * 0.4);
    ctx.lineTo(-s * 0.9, -s * 0.15);
    ctx.lineTo(-s * 0.7, 0);
    ctx.lineTo(-s * 0.9, s * 0.15);
    ctx.lineTo(-s * 0.7, s * 0.4);
    ctx.lineTo(s * 0.3, s * 0.45);
    ctx.closePath();
    ctx.fillStyle = "#1e1e1e";
    ctx.fill();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Panel lines
    ctx.strokeStyle = "rgba(100, 100, 100, 0.3)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.4);
    ctx.lineTo(-s * 0.4, 0);
    ctx.lineTo(0, s * 0.4);
    ctx.stroke();

    // Red sensor eye
    ctx.beginPath();
    ctx.arc(s * 0.5, 0, s * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "#ff3300";
    ctx.fill();

    // Engine (red-orange)
    ctx.beginPath();
    ctx.arc(-s * 0.8, 0, s * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4500";
    ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.015) * 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.shadowColor = "transparent";
    ctx.restore();
  }

  // ---- Floating mines (alien industrial orbs with energy spikes) ----
  for (const m of mines) {
    if (!m.alive) continue;
    const r = MINE_SIZE * 0.5;
    const pulse = 0.85 + Math.sin(performance.now() * 0.004 + m.x) * 0.15;
    const slowSpin = performance.now() * 0.0008 + m.x;

    ctx.save();
    ctx.translate(m.x, m.y);

    // Outer danger glow
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 40, 10, ${pulse * 0.12})`;
    ctx.fill();

    // Mine body — dark industrial metal with rust tones
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const mineGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r);
    mineGrad.addColorStop(0, "#444");
    mineGrad.addColorStop(0.4, "#2a2020");
    mineGrad.addColorStop(0.8, "#1a1010");
    mineGrad.addColorStop(1, "#0a0505");
    ctx.fillStyle = mineGrad;
    ctx.fill();
    ctx.strokeStyle = "#5a3030";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Rust-red band around equator
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.2, slowSpin, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180, 50, 30, ${pulse * 0.6})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Energy spikes (6 pointed, with glowing tips)
    const spikeCount = 6;
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * Math.PI * 2 + slowSpin;
      const baseX = Math.cos(angle) * r;
      const baseY = Math.sin(angle) * r;
      const tipX = Math.cos(angle) * (r + 7);
      const tipY = Math.sin(angle) * (r + 7);
      // Spike shaft
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Glowing tip
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 60, 20, ${pulse})`;
      ctx.fill();
    }

    // Central red eye
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 30, 10, ${pulse})`;
    ctx.fill();
    // Eye pupil
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    ctx.restore();
  }
}
