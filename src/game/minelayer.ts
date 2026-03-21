/**
 * minelayer.ts — Mine-Layer Plane & Floating Mines
 *
 * samAlive flag: when false (Haven SAM site destroyed), minelayer planes
 * spawn unconditionally — the fleeing flag no longer suppresses them,
 * and the spawn interval is shortened significantly.
 */

import { getWaterSurfaceY, getWaveY } from "./water";
import { spawnExplosion } from "./effects";

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
  vy: number;
  settled: boolean;
  alive: boolean;
  age: number;
}

let planes: MinelayerPlane[] = [];
let mines: Mine[] = [];
let spawnTimer = 0;
let gameTime = 0;

const PLANE_SPEED = 5;
const PLANE_Y = 25;
const DROP_INTERVAL = 1.2;
const MINE_SIZE = 18;
const MINE_SINK_SPEED = 0.8;
const MINE_BUOYANCY = 0.04;
const SCORE_MINE = 50;
const SCORE_MINELAYER = 250;
const PLANE_SIZE = 14;
const FIRST_SPAWN_DELAY = 45;
const SPAWN_INTERVAL_MIN = 50;
const SPAWN_INTERVAL_MAX = 80;
// When SAM is down, minelayers come much more frequently
const SPAWN_INTERVAL_NO_SAM_MIN = 18;
const SPAWN_INTERVAL_NO_SAM_MAX = 32;
const KILL_SPAWN_PENALTY = 30;
const MINE_MAX_COUNT = 40;
const MINE_OFFSCREEN_DESPAWN = 60;

export function resetMinelayer() {
  planes = [];
  mines = [];
  spawnTimer = FIRST_SPAWN_DELAY;
  gameTime = 0;
}

export function getMines() {
  return mines;
}
export function getPlanes() {
  return planes;
}

export function checkMissileHitsMineOrPlane(mx: number, my: number): { hit: boolean; score: number } {
  for (const p of planes) {
    if (!p.alive) continue;
    if (Math.hypot(mx - p.x, my - p.y) < PLANE_SIZE + 6) {
      p.alive = false;
      spawnExplosion(p.x, p.y, 40, SCORE_MINELAYER);
      spawnTimer += KILL_SPAWN_PENALTY;
      return { hit: true, score: SCORE_MINELAYER };
    }
  }
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

export function updateMinelayer(
  dt: number,
  worldWidth: number,
  viewH: number,
  waveDifficulty: number,
  fleeing: boolean,
  platforms?: { x: number; halfW: number; topY: number; bottomY: number }[],
  /** Pass false when Haven's SAM site is destroyed — minelayers ignore the fleeing flag */
  samAlive: boolean = true,
) {
  const waterY = getWaterSurfaceY(viewH);
  gameTime += dt;

  // Minelayers only spawn when SAM is down — samAlive=false gates spawning entirely
  const canSpawn = !samAlive && !fleeing;
  if (canSpawn) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = SPAWN_INTERVAL_NO_SAM_MIN + Math.random() * (SPAWN_INTERVAL_NO_SAM_MAX - SPAWN_INTERVAL_NO_SAM_MIN);
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
    p.dropCooldown -= dt;
    if (p.dropCooldown <= 0) {
      p.dropCooldown = DROP_INTERVAL + Math.random() * 0.4;
      if (mines.length < MINE_MAX_COUNT) {
        mines.push({
          x: p.x,
          y: p.y + 10,
          vy: MINE_SINK_SPEED,
          settled: false,
          alive: true,
          age: 0,
        });
      }
    }
    if (p.x < -100 || p.x > worldWidth + 100) p.alive = false;
  }

  // ---- Update mines ----
  for (const m of mines) {
    if (!m.alive) continue;
    m.age += dt;
    if (m.age > MINE_OFFSCREEN_DESPAWN && m.settled) {
      m.alive = false;
      continue;
    }
    if (!m.settled) {
      const surfaceY = getWaveY(m.x, waterY, worldWidth);
      if (m.y < surfaceY) {
        m.vy += 0.02;
        m.y += m.vy;
      } else {
        m.vy -= MINE_BUOYANCY;
        m.vy *= 0.92;
        m.y += m.vy;
        if (Math.abs(m.vy) < 0.05 && Math.abs(m.y - surfaceY) < 2) {
          m.settled = true;
          m.y = surfaceY;
        }
      }
    } else {
      m.y = getWaveY(m.x, waterY, worldWidth);
    }

    if (platforms) {
      for (const p of platforms) {
        if (m.x > p.x - p.halfW && m.x < p.x + p.halfW) {
          if (m.y < p.bottomY && m.y > p.topY - MINE_SIZE) {
            m.y = p.bottomY + 1;
            m.vy = Math.max(m.vy, 0);
            m.settled = false;
          }
        }
      }
    }
  }

  planes = planes.filter((p) => p.alive);
  mines = mines.filter((m) => m.alive);
}

export function checkBulletHitsMine(bullets: { x: number; y: number; dx: number; dy: number; id: number }[]): {
  remaining: typeof bullets;
  score: number;
} {
  const remaining: typeof bullets = [];
  let score = 0;

  for (const b of bullets) {
    let hit = false;

    for (const p of planes) {
      if (!p.alive) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) < PLANE_SIZE + 5) {
        p.alive = false;
        spawnExplosion(p.x, p.y, 40, SCORE_MINELAYER);
        score += SCORE_MINELAYER;
        spawnTimer += KILL_SPAWN_PENALTY;
        hit = true;
        break;
      }
    }

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

export function checkRamMine(px: number, py: number, radius: number): number {
  let score = 0;
  const ramRadius = radius * 1.3;

  for (const p of planes) {
    if (!p.alive) continue;
    if (Math.hypot(p.x - px, p.y - py) < ramRadius + PLANE_SIZE) {
      p.alive = false;
      spawnExplosion(p.x, p.y, 40, SCORE_MINELAYER);
      score += SCORE_MINELAYER;
      spawnTimer += KILL_SPAWN_PENALTY;
    }
  }

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

export function fleeMinelayers() {
  for (const p of planes) {
    p.speed = 8;
    p.dropCooldown = 999;
  }
}

export function drawMinelayer(ctx: CanvasRenderingContext2D, viewH: number) {
  for (const p of planes) {
    if (!p.alive) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.dir, 1);

    const s = 14;
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

    ctx.strokeStyle = "rgba(100, 100, 100, 0.3)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.4);
    ctx.lineTo(-s * 0.4, 0);
    ctx.lineTo(0, s * 0.4);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(s * 0.5, 0, s * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "#ff3300";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-s * 0.8, 0, s * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4500";
    ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.015) * 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  for (const m of mines) {
    if (!m.alive) continue;
    const r = MINE_SIZE * 0.5;
    const pulse = 0.85 + Math.sin(performance.now() * 0.004 + m.x) * 0.15;
    const slowSpin = performance.now() * 0.0008 + m.x;

    ctx.save();
    ctx.translate(m.x, m.y);

    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 40, 10, ${pulse * 0.12})`;
    ctx.fill();

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

    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.2, slowSpin, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180, 50, 30, ${pulse * 0.6})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const spikeCount = 6;
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * Math.PI * 2 + slowSpin;
      const baseX = Math.cos(angle) * r;
      const baseY = Math.sin(angle) * r;
      const tipX = Math.cos(angle) * (r + 7);
      const tipY = Math.sin(angle) * (r + 7);
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 60, 20, ${pulse})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 30, 10, ${pulse})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    ctx.restore();
  }
}
