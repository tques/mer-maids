/**
 * enemies.ts — Air Enemy System
 *
 * Manages all airborne threats:
 *
 * 1. **Bombers** (pink) — Fly horizontally, drop tumbling bombs on the city.
 * 2. **Chasers** (red/orange) — Fighter jets that pursue the player, fire beams
 *    and launch homing missiles. Patrol when player is submerged/out of range.
 * 3. **Homing Missiles** — Launched by chasers, track player with limited turn rate.
 * 4. **Bombs** — Dropped by bombers, tumble and fall with gravity.
 *
 * Related modules:
 * - effects.ts — Explosions and score popups (shared with submarine.ts)
 * - submarine.ts — Underwater enemies
 * - pickups.ts — All collectible items (health, repair, ammo)
 *
 * All entity arrays are module-level for performance (not React state).
 * Call resetEnemies() when starting a new game/wave.
 *
 * PERFORMANCE OPTIMIZATIONS (vs original):
 * - drawEnemies calls performance.now() ONCE before all draw loops; the
 *   result (drawNow) is reused for all per-entity time-based animations.
 *   (was: performance.now() called inside every bomber, chaser, missile,
 *   and bomb draw iteration — a syscall every entity every frame)
 * - updateEnemies cleanup uses in-place reverse-splice instead of
 *   Array.filter for all five entity arrays, avoiding per-frame allocation.
 * - Missile smoke trail cleanup also uses in-place splice.
 *
 * BUG FIXES:
 * - Missiles now explode on contact with the wave surface (getWaveY check)
 *   rather than passing through into the water.
 */

import { getWaterSurfaceY, getWaveY } from "./water";
import { spawnExplosion, updateEffects, drawEffects, resetEffects } from "./effects";
import { checkMissileHitsMineOrPlane } from "./minelayer";
// Re-export effects for backward compatibility
export { spawnExplosion, getExplosions, getScorePopups } from "./effects";
export type { Explosion, ScorePopup } from "./effects";

// ==================== INTERFACES ====================

/** A pink bomber that flies across and drops bombs */
export interface Enemy {
  x: number; // World X position
  y: number; // World Y position
  speed: number; // Horizontal movement speed
  dir: 1 | -1; // Direction: 1 = right, -1 = left
  angle: number; // Visual rotation angle
  targetX: number; // X position they're trying to bomb
  bombCooldown: number; // Seconds until next bomb drop
  alive: boolean;
}

/** A red/orange chaser fighter that pursues the player */
export interface Chaser {
  x: number;
  y: number;
  speed: number;
  angle: number; // Direction of travel (radians)
  shootCooldown: number; // Seconds until next bullet
  missileCooldown: number; // Seconds until next homing missile
  alive: boolean;
}

/** A beam bullet fired by chasers */
export interface ChaserBullet {
  x: number;
  y: number;
  dx: number; // X velocity per frame
  dy: number; // Y velocity per frame
  alive: boolean;
}

/** A homing missile that tracks the player */
export interface HomingMissile {
  x: number;
  y: number;
  angle: number; // Current heading (radians)
  speed: number;
  alive: boolean;
  deflected: boolean; // true = no longer homing, flies wild
  trail: { x: number; y: number; age: number }[]; // Smoke trail positions
}

/** A tumbling bomb dropped by bombers */
export interface Bomb {
  x: number;
  y: number;
  vy: number; // Vertical velocity (increases with gravity)
  rotation: number; // Current visual rotation
  rotSpeed: number; // How fast it tumbles
  alive: boolean;
  hangTime: number; // Brief delay before falling (just released from bomber)
}

// ==================== MODULE STATE ====================

let enemies: Enemy[] = [];
let chasers: Chaser[] = [];
let chaserBullets: ChaserBullet[] = [];
let homingMissiles: HomingMissile[] = [];
let bombs: Bomb[] = [];

let bomberSpawnTimer = 0; // Countdown to next bomber spawn
let chaserSpawnTimer = 1; // Countdown to next chaser spawn
let gameTime = 0; // Total elapsed game time (for difficulty ramping)

// ==================== CONSTANTS ====================

const ENEMY_SIZE = 16; // Bomber collision/visual radius
const CHASER_SIZE = 14; // Chaser collision/visual radius
const BOMB_SIZE = 14; // Bomb visual size
const BOMB_INTERVAL = 1.8; // Seconds between bomb drops from each bomber
const BOMB_GRAVITY = 0.025; // Vertical acceleration of falling bombs
const CHASER_SPEED = 3; // Base chaser movement speed
const CHASER_BULLET_SPEED = 6; // Speed of chaser beam bullets
const CHASER_SHOOT_INTERVAL = 2.4; // Seconds between chaser shots
const MISSILE_SPEED = 4; // Homing missile speed
const MISSILE_TURN_RATE = 0.045; // How fast missiles can turn (radians/frame)

// ==================== RESET & ACCESSORS ====================

/** Reset all enemy state. Called at game start and between waves. */
export function resetEnemies() {
  enemies = [];
  chasers = [];
  chaserBullets = [];
  homingMissiles = [];
  bombs = [];
  resetEffects();
  bomberSpawnTimer = 0;
  chaserSpawnTimer = 8;
  gameTime = 0;
}

export function getEnemies() {
  return enemies;
}
export function getChasers() {
  return chasers;
}
export function getChaserBullets() {
  return chaserBullets;
}
export function getHomingMissiles() {
  return homingMissiles;
}
export function getBombs() {
  return bombs;
}

// ==================== COLLISION CHECKS ====================

/**
 * Check if any chaser bullets hit the player.
 * Destroys bullets on contact and returns hit count.
 */
export function checkChaserBulletHitsPlayer(px: number, py: number, radius: number): number {
  let hits = 0;
  for (const cb of chaserBullets) {
    if (!cb.alive) continue;
    if (Math.hypot(cb.x - px, cb.y - py) < radius + 3) {
      cb.alive = false;
      hits++;
    }
  }
  return hits;
}

/**
 * Check if any homing missiles hit the player.
 * Creates explosion on contact. Returns hit count.
 */
export function checkMissileHitsPlayer(px: number, py: number, radius: number): number {
  let hits = 0;
  for (const m of homingMissiles) {
    if (!m.alive) continue;
    if (Math.hypot(m.x - px, m.y - py) < radius + 6) {
      m.alive = false;
      spawnExplosion(m.x, m.y, 30);
      hits++;
    }
  }
  return hits;
}

/**
 * Deflect all active homing missiles.
 * Called when the player performs a barrel roll or boost.
 * Missiles fly off wildly in a random direction, no longer tracking the player.
 */
export function deflectMissiles() {
  for (const m of homingMissiles) {
    if (!m.alive || m.deflected) continue;
    m.angle += (Math.random() - 0.5) * Math.PI * 1.5;
    m.speed = MISSILE_SPEED * (0.8 + Math.random() * 0.4);
    m.deflected = true;
  }
}

/**
 * Check if any falling bombs hit the city.
 * When barrier is up, bombs collide with the dome sphere.
 * When barrier is down, bombs collide with the platform rectangle.
 */
export function checkBombHitsShip(boatX: number, boatWidth: number, shipY: number, barrierUp: boolean = true): number {
  let hits = 0;
  const hw = boatWidth / 2;
  const domeRadius = hw * 0.85;
  const domeCenterY = shipY - 10;

  for (const b of bombs) {
    if (!b.alive) continue;

    if (barrierUp) {
      const dx = b.x - boatX;
      const dy = b.y - domeCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= domeRadius - 8 && dist <= domeRadius + 8 && b.y < domeCenterY && Math.abs(dx) < domeRadius) {
        b.alive = false;
        spawnExplosion(b.x, b.y, 25);
        hits++;
      }
    } else {
      if (b.y > shipY - 10 && b.y < shipY + 20 && b.x > boatX - hw && b.x < boatX + hw) {
        b.alive = false;
        spawnExplosion(b.x, b.y, 25);
        hits++;
      }
    }
  }
  return hits;
}

// ==================== WAVE FLEEING ====================

/**
 * Make all enemies flee the screen.
 * Called when a wave is completed — enemies fly away before the next wave starts.
 */
export function fleeAllEnemies() {
  for (const e of enemies) {
    if (e.alive) e.dir = e.x < 1500 ? -1 : 1;
    e.speed = 4;
    e.bombCooldown = 999;
  }
  for (const c of chasers) {
    if (c.alive) {
      c.angle = c.x < 1500 ? Math.PI : 0;
      c.speed = 5;
      c.shootCooldown = 999;
      c.missileCooldown = 999;
    }
  }
  for (const m of homingMissiles) m.alive = false;
}

/** Check if all enemies have fled/died */
export function areEnemiesGone(): boolean {
  return enemies.filter((e) => e.alive).length === 0 && chasers.filter((c) => c.alive).length === 0;
}

// ==================== MAIN UPDATE ====================

/**
 * Main enemy update function. Called once per frame.
 * Handles spawning, AI, movement, shooting, and cleanup for all air enemies.
 *
 * PERF: Entity cleanup uses in-place reverse-splice instead of Array.filter
 * on all five arrays, avoiding per-frame array allocation and GC pressure.
 * Missile smoke trail cleanup also uses in-place splice.
 */
export function updateEnemies(
  dt: number,
  worldWidth: number,
  viewH: number,
  boatX: number,
  boatWidth: number,
  playerX: number,
  playerY: number,
  viewHalfW: number,
  waveDifficulty: number = 1,
  fleeing: boolean = false,
): number {
  const waterY = getWaterSurfaceY(viewH);
  let deflectScore = 0;
  gameTime += dt;

  const timeDifficulty = Math.min(gameTime / 180, 1);
  const difficulty = Math.min(timeDifficulty * waveDifficulty, 2.5);

  // ==================== BOMBER SPAWNING ====================
  if (!fleeing) {
    const bomberInterval = Math.max(20 - difficulty * 7, 3);
    bomberSpawnTimer -= dt;
    if (bomberSpawnTimer <= 0 && gameTime > 10 / waveDifficulty) {
      bomberSpawnTimer = bomberInterval + Math.random() * 4;
      const fromLeft = Math.random() > 0.5;
      const dir = fromLeft ? 1 : -1;
      const spawnX = fromLeft
        ? boatX - boatWidth - 200 - Math.random() * 200
        : boatX + boatWidth + 200 + Math.random() * 200;
      enemies.push({
        x: spawnX,
        y: -30 - Math.random() * 60,
        speed: 2.4 + Math.random() * 0.8,
        dir: dir as 1 | -1,
        angle: 0,
        targetX: boatX + (Math.random() - 0.5) * viewHalfW,
        bombCooldown: 0.5 + Math.random(),
        alive: true,
      });
    }
  }

  // ==================== BOMBER UPDATE ====================
  // PERF: performance.now() called once here and reused in draw — not in update
  const updateNow = performance.now();

  for (const e of enemies) {
    if (!e.alive) continue;

    if (fleeing) {
      e.x += e.dir * e.speed;
      e.y -= 1.5;
      if (e.y < -100 || Math.abs(e.x - playerX) > viewHalfW * 4) e.alive = false;
      continue;
    }

    const cruiseY = 40 + Math.abs(Math.sin(e.targetX * 0.01)) * waterY * 0.25;
    if (e.y < cruiseY) {
      e.y += 1.2;
    } else {
      e.y += Math.sin(updateNow * 0.003 + e.x * 0.01) * 0.3; // Gentle bob
    }

    e.x += e.dir * e.speed;

    e.bombCooldown -= dt;
    if (Math.abs(e.x - e.targetX) < 120 && e.bombCooldown <= 0) {
      e.bombCooldown = BOMB_INTERVAL + Math.random() * 0.5;
      bombs.push({
        x: e.x,
        y: e.y + ENEMY_SIZE,
        vy: 0,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 8,
        alive: true,
        hangTime: 0.5 + Math.random() * 0.3,
      });
    }

    if (Math.abs(e.x - playerX) > viewHalfW * 4) e.alive = false;
  }

  // ==================== CHASER SPAWNING ====================
  const maxChasers = fleeing ? 0 : gameTime < 8 / waveDifficulty ? 0 : Math.min(3 + Math.floor(difficulty * 9), 24);
  const chaserInterval = Math.max(6 - difficulty * 2, 1.5);
  chaserSpawnTimer -= dt;
  let aliveChaserCount = 0;
  for (const c of chasers) {
    if (c.alive) aliveChaserCount++;
  }
  if (chaserSpawnTimer <= 0 && aliveChaserCount < maxChasers) {
    chaserSpawnTimer = chaserInterval + Math.random() * 1.5;
    const fromLeft = Math.random() > 0.5;
    const spawnX = fromLeft
      ? playerX - viewHalfW - 200 - Math.random() * 300
      : playerX + viewHalfW + 200 + Math.random() * 300;
    chasers.push({
      x: spawnX,
      y: 30 + Math.random() * waterY * 0.5,
      speed: CHASER_SPEED,
      angle: 0,
      shootCooldown: 2 + Math.random(),
      missileCooldown: 8 + Math.random() * 6,
      alive: true,
    });
  }

  // ==================== CHASER AI UPDATE ====================
  const playerSubmerged = playerY > waterY;
  const waterCeiling = waterY - CHASER_SIZE * 6;

  for (const c of chasers) {
    if (!c.alive) continue;

    if (fleeing) {
      const fleeDir = c.x < 1500 ? -1 : 1;
      c.angle = fleeDir < 0 ? Math.PI : 0;
      c.x += Math.cos(c.angle) * (c.speed + 2);
      if (Math.abs(c.x - playerX) > viewHalfW * 4) c.alive = false;
      continue;
    }

    const playerVisible = !playerSubmerged && Math.abs(c.x - playerX) < viewHalfW * 2;

    if (playerVisible) {
      const targetAngle = Math.atan2(playerY - c.y, playerX - c.x);
      let da = targetAngle - c.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      c.angle += Math.sign(da) * Math.min(Math.abs(da), waveDifficulty > 2 ? 0.04 : 0.03);
    }

    c.x += Math.cos(c.angle) * c.speed;
    c.y += Math.sin(c.angle) * c.speed;

    if (c.y > waterCeiling) {
      c.y = waterCeiling;
      if (c.angle > 0) c.angle *= 0.7;
    }

    c.shootCooldown -= dt;
    if (c.shootCooldown <= 0 && playerVisible) {
      c.shootCooldown = CHASER_SHOOT_INTERVAL + Math.random() * 0.5;
      chaserBullets.push({
        x: c.x + Math.cos(c.angle) * (CHASER_SIZE + 4),
        y: c.y + Math.sin(c.angle) * (CHASER_SIZE + 4),
        dx: Math.cos(c.angle) * CHASER_BULLET_SPEED,
        dy: Math.sin(c.angle) * CHASER_BULLET_SPEED,
        alive: true,
      });
    }

    c.missileCooldown -= dt;
    const missileInterval = Math.max((18 - waveDifficulty * 4) * 3, 15);
    if (c.missileCooldown <= 0 && playerVisible) {
      c.missileCooldown = missileInterval + Math.random() * 4;
      const mAngle = Math.atan2(playerY - c.y, playerX - c.x);
      homingMissiles.push({
        x: c.x + Math.cos(mAngle) * (CHASER_SIZE + 6),
        y: c.y + Math.sin(mAngle) * (CHASER_SIZE + 6),
        angle: mAngle,
        speed: MISSILE_SPEED,
        alive: true,
        deflected: false,
        trail: [],
      });
    }

    if (Math.abs(c.x - playerX) > viewHalfW * 4) c.alive = false;
  }

  // ==================== CHASER BULLET UPDATE ====================
  for (const cb of chaserBullets) {
    if (!cb.alive) continue;
    cb.x += cb.dx;
    cb.y += cb.dy;
    if (cb.y < -10 || cb.y > viewH + 10 || Math.abs(cb.x - playerX) > viewHalfW * 3) cb.alive = false;
  }

  // ==================== HOMING MISSILE UPDATE ====================
  for (const m of homingMissiles) {
    if (!m.alive) continue;

    if (!m.deflected) {
      const targetAngle = Math.atan2(playerY - m.y, playerX - m.x);
      let da = targetAngle - m.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      m.angle += Math.sign(da) * Math.min(Math.abs(da), MISSILE_TURN_RATE);
    }

    m.x += Math.cos(m.angle) * m.speed;
    m.y += Math.sin(m.angle) * m.speed;

    if (m.y > viewH + 20) {
      m.alive = false;
      continue;
    }

    // Missiles cannot enter water — explode on contact with the wave surface
    const waveAtMissile = getWaveY(m.x, waterY);
    if (m.y >= waveAtMissile) {
      m.alive = false;
      spawnExplosion(m.x, waveAtMissile, 25);
      continue;
    }

    const mineHit = checkMissileHitsMineOrPlane(m.x, m.y);
    if (mineHit.hit) {
      m.alive = false;
      spawnExplosion(m.x, m.y, 25);
      deflectScore += mineHit.score;
      continue;
    }

    // Update smoke trail — in-place splice for the age-out
    m.trail.push({ x: m.x, y: m.y, age: 0 });
    for (const t of m.trail) t.age += dt;
    for (let i = m.trail.length - 1; i >= 0; i--) {
      if (m.trail[i].age >= 0.5) m.trail.splice(i, 1);
    }

    if (Math.abs(m.x - playerX) > viewHalfW * 4) {
      m.alive = false;
      spawnExplosion(m.x, m.y, 15);
    }
  }

  // ==================== BOMB UPDATE ====================
  for (const b of bombs) {
    if (!b.alive) continue;
    if (b.hangTime > 0) {
      b.hangTime -= dt;
      b.rotation += b.rotSpeed * dt * 0.3;
    } else {
      b.vy += BOMB_GRAVITY;
      b.y += b.vy;
      b.rotation += b.rotSpeed * dt;
    }
    if (b.y > viewH + 20) b.alive = false;
  }

  updateEffects(dt);

  // ==================== CLEANUP DEAD ENTITIES ====================
  // PERF: In-place reverse-splice instead of Array.filter — no new array allocation
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (!enemies[i].alive) enemies.splice(i, 1);
  }
  for (let i = chasers.length - 1; i >= 0; i--) {
    if (!chasers[i].alive) chasers.splice(i, 1);
  }
  for (let i = chaserBullets.length - 1; i >= 0; i--) {
    if (!chaserBullets[i].alive) chaserBullets.splice(i, 1);
  }
  for (let i = homingMissiles.length - 1; i >= 0; i--) {
    if (!homingMissiles[i].alive) homingMissiles.splice(i, 1);
  }
  for (let i = bombs.length - 1; i >= 0; i--) {
    if (!bombs[i].alive) bombs.splice(i, 1);
  }

  return deflectScore;
}

// ==================== SCORE VALUES ====================

export const SCORE_BOMBER = 150;
export const SCORE_CHASER = 100;
export const SCORE_BOMB = 25;

// ==================== PLAYER BULLET COLLISION ====================

/**
 * Check player bullets against all enemy entities.
 * Returns remaining bullets (those that didn't hit anything) and total score earned.
 * Checks in priority order: bombers → chasers → bombs → homing missiles
 */
export function checkBulletCollisions(bullets: { x: number; y: number; dx: number; dy: number; id: number }[]): {
  remaining: typeof bullets;
  score: number;
} {
  const remainingBullets: typeof bullets = [];
  let score = 0;

  for (const b of bullets) {
    let hit = false;

    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.hypot(b.x - e.x, b.y - e.y) < ENEMY_SIZE + 5) {
        e.alive = false;
        spawnExplosion(e.x, e.y, 35, SCORE_BOMBER);
        score += SCORE_BOMBER;
        hit = true;
        break;
      }
    }

    if (!hit) {
      for (const c of chasers) {
        if (!c.alive) continue;
        if (Math.hypot(b.x - c.x, b.y - c.y) < CHASER_SIZE + 5) {
          c.alive = false;
          spawnExplosion(c.x, c.y, 30, SCORE_CHASER);
          score += SCORE_CHASER;
          hit = true;
          break;
        }
      }
    }

    if (!hit) {
      for (const bomb of bombs) {
        if (!bomb.alive) continue;
        if (Math.hypot(b.x - bomb.x, b.y - bomb.y) < BOMB_SIZE + 5) {
          bomb.alive = false;
          spawnExplosion(bomb.x, bomb.y, 20, SCORE_BOMB);
          score += SCORE_BOMB;
          hit = true;
          break;
        }
      }
    }

    if (!hit) {
      for (const m of homingMissiles) {
        if (!m.alive) continue;
        if (Math.hypot(b.x - m.x, b.y - m.y) < 8) {
          m.alive = false;
          spawnExplosion(m.x, m.y, 25, 50);
          score += 50;
          hit = true;
          break;
        }
      }
    }

    if (!hit) remainingBullets.push(b);
  }

  return { remaining: remainingBullets, score };
}

// ==================== RAM COLLISION ====================

/**
 * Checks if the boosting player rams into any enemies.
 * Destroys them on contact and returns total score earned.
 */
export function checkRamCollisions(px: number, py: number, radius: number): number {
  let score = 0;
  const ramRadius = radius * 1.3;

  for (const e of enemies) {
    if (!e.alive) continue;
    if (Math.hypot(px - e.x, py - e.y) < ramRadius + ENEMY_SIZE) {
      e.alive = false;
      spawnExplosion(e.x, e.y, 40, SCORE_BOMBER);
      score += SCORE_BOMBER;
    }
  }

  for (const c of chasers) {
    if (!c.alive) continue;
    if (Math.hypot(px - c.x, py - c.y) < ramRadius + CHASER_SIZE) {
      c.alive = false;
      spawnExplosion(c.x, c.y, 35, SCORE_CHASER);
      score += SCORE_CHASER;
    }
  }

  for (const m of homingMissiles) {
    if (!m.alive) continue;
    if (Math.hypot(px - m.x, py - m.y) < ramRadius + 8) {
      m.alive = false;
      spawnExplosion(m.x, m.y, 25, 50);
      score += 50;
    }
  }

  for (const bomb of bombs) {
    if (!bomb.alive) continue;
    if (Math.hypot(px - bomb.x, py - bomb.y) < ramRadius + BOMB_SIZE) {
      bomb.alive = false;
      spawnExplosion(bomb.x, bomb.y, 20, SCORE_BOMB);
      score += SCORE_BOMB;
    }
  }

  return score;
}

// ==================== RENDERING ====================

/**
 * Draws all air enemies, their projectiles, explosions, and score popups.
 * Called within a camera-translated context (world coordinates).
 *
 * PERF: performance.now() is called ONCE here and stored as `drawNow`.
 * All per-entity animated values (engine pulse, eye pulse, bomb core, etc.)
 * use drawNow instead of calling performance.now() inside each loop iteration.
 */
export function drawEnemies(ctx: CanvasRenderingContext2D) {
  // PERF: Single performance.now() call for the entire draw pass
  const drawNow = performance.now();

  // ---- Alien Bombers (dark industrial, toxic green accents) ----
  for (const e of enemies) {
    if (!e.alive) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.dir === 1 ? 0 : Math.PI);

    const s = ENEMY_SIZE;
    ctx.beginPath();
    ctx.moveTo(s * 1.1, 0);
    ctx.lineTo(s * 0.3, -s * 0.5);
    ctx.lineTo(-s * 0.6, -s * 0.6);
    ctx.lineTo(-s * 0.9, -s * 0.3);
    ctx.lineTo(-s * 0.7, 0);
    ctx.lineTo(-s * 0.9, s * 0.3);
    ctx.lineTo(-s * 0.6, s * 0.6);
    ctx.lineTo(s * 0.3, s * 0.5);
    ctx.closePath();
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.strokeStyle = "#3a3a3a";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = "rgba(100, 100, 100, 0.4)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(s * 0.1, -s * 0.45);
    ctx.lineTo(-s * 0.4, 0);
    ctx.lineTo(s * 0.1, s * 0.45);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(s * 0.4, 0, s * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#40ff40";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.4, 0, s * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();

    // Engine exhaust — uses hoisted drawNow
    ctx.beginPath();
    ctx.arc(-s * 0.8, 0, s * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "#60ff60";
    ctx.globalAlpha = 0.5 + Math.sin(drawNow * 0.015) * 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ---- Alien Chasers (dark angular, red sensor, robotic) ----
  for (const c of chasers) {
    if (!c.alive) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);

    const s = CHASER_SIZE;
    ctx.beginPath();
    ctx.moveTo(s * 1.2, 0);
    ctx.lineTo(s * 0.4, -s * 0.3);
    ctx.lineTo(s * 0.1, -s * 0.55);
    ctx.lineTo(-s * 0.5, -s * 0.5);
    ctx.lineTo(-s * 0.7, -s * 0.2);
    ctx.lineTo(-s * 0.6, 0);
    ctx.lineTo(-s * 0.7, s * 0.2);
    ctx.lineTo(-s * 0.5, s * 0.5);
    ctx.lineTo(s * 0.1, s * 0.55);
    ctx.lineTo(s * 0.4, s * 0.3);
    ctx.closePath();
    ctx.fillStyle = "#222222";
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = "rgba(150, 150, 150, 0.3)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(s * 0.1, -s * 0.5);
    ctx.lineTo(-s * 0.3, 0);
    ctx.lineTo(s * 0.1, s * 0.5);
    ctx.stroke();

    // Red sensor eye — uses hoisted drawNow
    const eyePulse = 0.6 + Math.sin(drawNow * 0.008 + c.x) * 0.4;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, 0, s * 0.14, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 30, 10, ${eyePulse})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.5, 0, s * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Twin engine exhausts — uses hoisted drawNow
    ctx.beginPath();
    ctx.arc(-s * 0.65, -s * 0.15, s * 0.07, 0, Math.PI * 2);
    ctx.arc(-s * 0.65, s * 0.15, s * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4500";
    ctx.globalAlpha = 0.5 + Math.sin(drawNow * 0.012 + c.x) * 0.4;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ---- Chaser Beam Bullets ----
  for (const cb of chaserBullets) {
    if (!cb.alive) continue;
    const bAngle = Math.atan2(cb.dy, cb.dx);
    ctx.save();
    ctx.translate(cb.x, cb.y);
    ctx.rotate(bAngle);
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -4);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 120, 40, 0.3)";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -2);
    ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fillStyle = "#ff6b35";
    ctx.fill();
    // Bright core
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-3, -1);
    ctx.lineTo(-3, 1);
    ctx.closePath();
    ctx.fillStyle = "#ffe0b2";
    ctx.fill();
    ctx.restore();
  }

  // ---- Homing Missiles (very visible with warning ring) ----
  for (const m of homingMissiles) {
    if (!m.alive) continue;

    // Smoke trail
    for (const t of m.trail) {
      const alpha = Math.max(0, 1 - t.age / 0.5);
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3 * alpha, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 100, 50, ${alpha * 0.6})`;
      ctx.fill();
    }

    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);

    // Pulsing red glow — uses hoisted drawNow
    const pulse = 0.7 + Math.sin(drawNow * 0.02) * 0.3;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(4, -7);
    ctx.lineTo(-12, -6);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-12, 6);
    ctx.lineTo(4, 7);
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 60, 60, ${pulse * 0.25})`;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(3, -4);
    ctx.lineTo(-8, -3);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-8, 3);
    ctx.lineTo(3, 4);
    ctx.closePath();
    ctx.fillStyle = "#ff4444";
    ctx.fill();
    ctx.strokeStyle = "#cc0000";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(7, 0, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffcc00";
    ctx.fill();

    ctx.fillStyle = "#cc2222";
    ctx.fillRect(-9, -5, 4, 2);
    ctx.fillRect(-9, 3, 4, 2);

    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.lineTo(-14 - Math.random() * 4, 0);
    ctx.lineTo(-10, 2);
    ctx.fillStyle = `rgba(255, 200, 50, ${0.7 + Math.random() * 0.3})`;
    ctx.fill();

    ctx.restore();

    // Warning indicator ring — uses hoisted drawNow
    ctx.save();
    ctx.beginPath();
    ctx.arc(m.x, m.y, 16 + Math.sin(drawNow * 0.015) * 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 50, 50, ${0.3 + Math.sin(drawNow * 0.01) * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ---- Tumbling Bombs (dark industrial alien ordnance) ----
  for (const b of bombs) {
    if (!b.alive) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rotation);

    const bs = BOMB_SIZE * 0.5;

    ctx.beginPath();
    ctx.moveTo(bs, 0);
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * bs, Math.sin(a) * bs);
    }
    ctx.closePath();
    const bombGrad = ctx.createRadialGradient(-bs * 0.2, -bs * 0.2, 0, 0, 0, bs);
    bombGrad.addColorStop(0, "#3a3a3a");
    bombGrad.addColorStop(0.6, "#1e1e1e");
    bombGrad.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = bombGrad;
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = "rgba(120, 120, 120, 0.3)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-bs, 0);
    ctx.lineTo(bs, 0);
    ctx.moveTo(0, -bs);
    ctx.lineTo(0, bs);
    ctx.stroke();

    // Pulsing toxic core — uses hoisted drawNow
    const bombPulse = 0.5 + Math.sin(drawNow * 0.01 + b.x) * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, bs * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(80, 255, 60, ${bombPulse * 0.9})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, bs * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 255, 180, ${bombPulse})`;
    ctx.fill();

    ctx.restore();
  }

  // ---- Explosions & Score Popups (drawn by effects.ts) ----
  drawEffects(ctx);
}
