/**
 * enemies.ts — Air Enemy System
 *
 * Manages all airborne threats:
 *
 * 1. **Bombers** (pink) — Fly horizontally across the screen, drop tumbling
 *    bombs on the city. They cruise at a set altitude and drop bombs when
 *    near their target X position.
 *
 * 2. **Chasers** (red/orange) — Aggressive fighter jets that pursue the player.
 *    They fire beam bullets and occasionally launch homing missiles.
 *    They have a vision range and patrol when the player is out of sight
 *    or submerged.
 *
 * 3. **Homing Missiles** — Launched by chasers. They track the player with
 *    limited turn rate. Can be deflected by barrel rolls or destroyed by bullets.
 *
 * 4. **Bombs** — Dropped by bombers. They tumble and fall with gravity.
 *    Hit the city's dome barrier or the city itself if barrier is down.
 *
 * 5. **Explosions** — Visual effect spawned when anything is destroyed.
 *
 * 6. **Score Popups** — Floating "+150" text when enemies are killed.
 *
 * All entity arrays are module-level for performance (not React state).
 * Call resetEnemies() when starting a new game/wave.
 */

import { getWaterSurfaceY } from "./water";
import { spawnExplosion, updateEffects, drawEffects, resetEffects } from "./effects";
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
  life: number; // Remaining lifetime in seconds
  alive: boolean;
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
let explosions: Explosion[] = [];
let bomberSpawnTimer = 0; // Countdown to next bomber spawn
let chaserSpawnTimer = 3; // Countdown to next chaser spawn
let gameTime = 0; // Total elapsed game time (for difficulty ramping)

// ==================== CONSTANTS ====================

const ENEMY_SIZE = 16; // Bomber collision/visual radius
const CHASER_SIZE = 14; // Chaser collision/visual radius
const BOMB_SIZE = 14; // Bomb visual size
const BOMB_INTERVAL = 1.8; // Seconds between bomb drops from each bomber
const BOMB_GRAVITY = 0.025; // Vertical acceleration of falling bombs
const CHASER_SPEED = 3; // Base chaser movement speed
const CHASER_BULLET_SPEED = 6; // Speed of chaser beam bullets
const CHASER_SHOOT_INTERVAL = 1.2; // Seconds between chaser shots
const MISSILE_SPEED = 4; // Homing missile speed
const MISSILE_TURN_RATE = 0.045; // How fast missiles can turn (radians/frame)
const MISSILE_LIFETIME = 6; // Seconds before missile self-destructs

// ==================== RESET & ACCESSORS ====================

/** Reset all enemy state. Called at game start and between waves. */
export function resetEnemies() {
  enemies = [];
  chasers = [];
  chaserBullets = [];
  homingMissiles = [];
  bombs = [];
  explosions = [];
  scorePopups = [];
  bomberSpawnTimer = 0;
  chaserSpawnTimer = 8;
  gameTime = 0;
}

// Accessor functions — expose read-only access to entity arrays
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
export function getExplosions() {
  return explosions;
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
 * Randomizes missile heading and shortens remaining lifetime.
 */
export function deflectMissiles() {
  for (const m of homingMissiles) {
    if (!m.alive) continue;
    m.angle += (Math.random() - 0.5) * Math.PI * 1.5; // Wild random deflection
    m.speed *= 0.6; // Slow them down
    m.life = Math.min(m.life, 1.2); // Expire soon
  }
}

/**
 * Check if any falling bombs hit the city.
 * When barrier is up, bombs collide with the dome sphere.
 * When barrier is down, bombs collide with the platform rectangle.
 *
 * @returns Number of bomb hits
 */
export function checkBombHitsShip(boatX: number, boatWidth: number, shipY: number, barrierUp: boolean = true): number {
  let hits = 0;
  const hw = boatWidth / 2;
  const domeRadius = hw * 0.85;
  const domeCenterY = shipY - 10;

  for (const b of bombs) {
    if (!b.alive) continue;

    if (barrierUp) {
      // Check against dome sphere (circular collision)
      const dx = b.x - boatX;
      const dy = b.y - domeCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Hit if bomb is near the dome edge and above center
      if (dist >= domeRadius - 8 && dist <= domeRadius + 8 && b.y < domeCenterY && Math.abs(dx) < domeRadius) {
        b.alive = false;
        spawnExplosion(b.x, b.y, 25);
        hits++;
      }
    } else {
      // Check against flat platform (rectangular collision)
      if (b.y > shipY - 10 && b.y < shipY + 20 && b.x > boatX - hw && b.x < boatX + hw) {
        b.alive = false;
        spawnExplosion(b.x, b.y, 25);
        hits++;
      }
    }
  }
  return hits;
}

// ==================== SCORE POPUPS ====================

/** Floating score text that appears when enemies are destroyed */
export interface ScorePopup {
  x: number;
  y: number;
  value: number; // Score amount to display
  life: number; // Remaining life (1.0 → 0.0)
}

let scorePopups: ScorePopup[] = [];

export function getScorePopups() {
  return scorePopups;
}

/**
 * Create a visual explosion and optional score popup.
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

// ==================== WAVE FLEEING ====================

/**
 * Make all enemies flee the screen.
 * Called when a wave is completed — enemies fly away before the next wave starts.
 */
export function fleeAllEnemies() {
  for (const e of enemies) {
    if (e.alive) e.dir = e.x < 1500 ? -1 : 1; // Flee toward nearest edge
    e.speed = 4; // Speed up
    e.bombCooldown = 999; // Stop bombing
  }
  for (const c of chasers) {
    if (c.alive) {
      c.angle = c.x < 1500 ? Math.PI : 0; // Turn toward nearest edge
      c.speed = 5;
      c.shootCooldown = 999; // Stop shooting
      c.missileCooldown = 999;
    }
  }
  // Immediately kill all missiles
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
 * @param dt - Delta time in seconds
 * @param worldWidth - Total world width
 * @param viewH - Logical view height
 * @param boatX - City center X position
 * @param boatWidth - City platform width
 * @param playerX - Player X position (for chaser targeting)
 * @param playerY - Player Y position
 * @param viewHalfW - Half the view width (for culling)
 * @param waveDifficulty - Current wave difficulty multiplier (1.0+)
 * @param fleeing - Whether enemies should be fleeing (wave transition)
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
) {
  const waterY = getWaterSurfaceY(viewH);
  gameTime += dt;

  // Difficulty ramps with both time and wave number
  const timeDifficulty = Math.min(gameTime / 180, 1); // Caps at 3 minutes
  const difficulty = Math.min(timeDifficulty * waveDifficulty, 2.5);

  // ==================== BOMBER SPAWNING ====================
  if (!fleeing) {
    const bomberInterval = Math.max(20 - difficulty * 7, 3); // Faster spawns at higher difficulty
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
        y: -30 - Math.random() * 60, // Spawn above screen
        speed: 2.4 + Math.random() * 0.8,
        dir: dir as 1 | -1,
        angle: 0,
        targetX: boatX + (Math.random() - 0.5) * viewHalfW, // Target near the city
        bombCooldown: 0.5 + Math.random(),
        alive: true,
      });
    }
  }

  // ==================== BOMBER UPDATE ====================
  for (const e of enemies) {
    if (!e.alive) continue;

    if (fleeing) {
      // Flee: move in current direction and climb
      e.x += e.dir * e.speed;
      e.y -= 1.5;
      if (e.y < -100 || Math.abs(e.x - playerX) > viewHalfW * 4) e.alive = false;
      continue;
    }

    // Descend to cruise altitude
    const cruiseY = 40 + Math.abs(Math.sin(e.targetX * 0.01)) * waterY * 0.25;
    if (e.y < cruiseY) {
      e.y += 1.2; // Descend
    } else {
      e.y += Math.sin(performance.now() * 0.003 + e.x * 0.01) * 0.3; // Gentle bob
    }

    e.x += e.dir * e.speed; // Horizontal movement

    // Drop bombs when near target
    e.bombCooldown -= dt;
    if (Math.abs(e.x - e.targetX) < 120 && e.bombCooldown <= 0) {
      e.bombCooldown = BOMB_INTERVAL + Math.random() * 0.5;
      bombs.push({
        x: e.x,
        y: e.y + ENEMY_SIZE,
        vy: 0,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 8, // Random tumble direction
        alive: true,
        hangTime: 0.5 + Math.random() * 0.3, // Brief delay before falling
      });
    }

    // Despawn if far off-screen
    if (Math.abs(e.x - playerX) > viewHalfW * 4) e.alive = false;
  }

  // ==================== CHASER SPAWNING ====================
  const maxChasers = fleeing ? 0 : gameTime < 8 / waveDifficulty ? 0 : Math.min(1 + Math.floor(difficulty * 3), 8);
  const chaserInterval = Math.max(12 - difficulty * 4, 2);
  chaserSpawnTimer -= dt;
  const aliveChasers = chasers.filter((c) => c.alive).length;
  if (chaserSpawnTimer <= 0 && aliveChasers < maxChasers) {
    chaserSpawnTimer = chaserInterval + Math.random() * 3;
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
      missileCooldown: 8 + Math.random() * 6, // First missile is delayed
      alive: true,
    });
  }

  // ==================== CHASER AI UPDATE ====================
  const playerSubmerged = playerY > waterY;
  const waterCeiling = waterY - CHASER_SIZE * 6; // Chasers won't go below this Y

  for (const c of chasers) {
    if (!c.alive) continue;

    if (fleeing) {
      // Flee toward nearest screen edge
      const fleeDir = c.x < 1500 ? -1 : 1;
      const fleeAngle = Math.atan2(-1, fleeDir);
      let angleDiff = fleeAngle - c.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      c.angle += angleDiff * 0.05;
      c.x += Math.cos(c.angle) * 5;
      c.y += Math.sin(c.angle) * 5;
      if (c.y < -100 || Math.abs(c.x - playerX) > viewHalfW * 4) c.alive = false;
      continue;
    }

    // ---- Chaser Vision System ----
    const distToPlayer = Math.hypot(playerX - c.x, playerY - c.y);
    const VISION_RANGE = 350;
    const playerVisible = !playerSubmerged && distToPlayer < VISION_RANGE;

    let targetX: number;
    let targetY: number;

    if (!playerVisible) {
      // PATROL mode: fly back and forth near the player's last area
      if (!(c as any)._patrolDir) (c as any)._patrolDir = c.x < playerX ? 1 : -1;
      if (!(c as any)._patrolAlt) (c as any)._patrolAlt = waterCeiling - 60 - Math.random() * 80;

      const patrolDir = (c as any)._patrolDir as number;
      targetX = c.x + patrolDir * 200;
      targetY = (c as any)._patrolAlt as number;

      // Reverse patrol direction at edges
      if (c.x < playerX - viewHalfW) (c as any)._patrolDir = 1;
      else if (c.x > playerX + viewHalfW) (c as any)._patrolDir = -1;
    } else {
      // PURSUE mode: chase the player directly
      (c as any)._patrolDir = null;
      (c as any)._patrolAlt = null;
      targetX = playerX;
      targetY = Math.min(playerY, waterCeiling); // Don't chase into water
    }

    // Smooth angle interpolation toward target
    const targetAngle = Math.atan2(targetY - c.y, targetX - c.x);
    let angleDiff = targetAngle - c.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    c.angle += angleDiff * (playerVisible ? 0.04 : 0.03);

    // Move in facing direction
    c.x += Math.cos(c.angle) * c.speed;
    c.y += Math.sin(c.angle) * c.speed;

    // Don't fly into the water
    if (c.y > waterCeiling) {
      c.y = waterCeiling;
      if (c.angle > 0) c.angle *= 0.7; // Pull up
    }

    // ---- Shooting ----
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

    // ---- Homing Missile Launch ----
    c.missileCooldown -= dt;
    const missileInterval = Math.max(18 - waveDifficulty * 4, 5);
    if (c.missileCooldown <= 0 && playerVisible) {
      c.missileCooldown = missileInterval + Math.random() * 4;
      const mAngle = Math.atan2(playerY - c.y, playerX - c.x);
      homingMissiles.push({
        x: c.x + Math.cos(mAngle) * (CHASER_SIZE + 6),
        y: c.y + Math.sin(mAngle) * (CHASER_SIZE + 6),
        angle: mAngle,
        speed: MISSILE_SPEED,
        life: MISSILE_LIFETIME,
        alive: true,
        trail: [],
      });
    }

    // Despawn if far away
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
    m.life -= dt;
    if (m.life <= 0) {
      m.alive = false;
      spawnExplosion(m.x, m.y, 20);
      continue;
    }
    // Home toward player with limited turn rate
    const targetAngle = Math.atan2(playerY - m.y, playerX - m.x);
    let angleDiff = targetAngle - m.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    m.angle += angleDiff * MISSILE_TURN_RATE;
    m.x += Math.cos(m.angle) * m.speed;
    m.y += Math.sin(m.angle) * m.speed;
    // Update smoke trail
    m.trail.push({ x: m.x, y: m.y, age: 0 });
    for (const t of m.trail) t.age += dt;
    m.trail = m.trail.filter((t) => t.age < 0.5);
    // Cull if off-screen
    if (Math.abs(m.x - playerX) > viewHalfW * 4) m.alive = false;
  }

  // ==================== BOMB UPDATE ====================
  for (const b of bombs) {
    if (!b.alive) continue;
    if (b.hangTime > 0) {
      // Brief hang before falling (just released from bomber)
      b.hangTime -= dt;
      b.rotation += b.rotSpeed * dt * 0.3;
    } else {
      // Falling with gravity
      b.vy += BOMB_GRAVITY;
      b.y += b.vy;
      b.rotation += b.rotSpeed * dt;
    }
    if (b.y > viewH + 20) b.alive = false; // Off-screen below
  }

  // ==================== EXPLOSION & POPUP UPDATE ====================
  for (const ex of explosions) {
    ex.life -= dt / ex.maxLife;
    ex.radius += (ex.maxRadius - ex.radius) * 0.15; // Ease toward max size
  }

  for (const sp of scorePopups) {
    sp.life -= dt * 1.2;
    sp.y -= 0.8; // Float upward
  }

  // ==================== CLEANUP DEAD ENTITIES ====================
  enemies = enemies.filter((e) => e.alive);
  chasers = chasers.filter((c) => c.alive);
  chaserBullets = chaserBullets.filter((cb) => cb.alive);
  homingMissiles = homingMissiles.filter((m) => m.alive);
  bombs = bombs.filter((b) => b.alive);
  explosions = explosions.filter((ex) => ex.life > 0);
  scorePopups = scorePopups.filter((sp) => sp.life > 0);
}

// ==================== SCORE VALUES ====================

/** Points awarded for destroying each enemy type */
export const SCORE_BOMBER = 150;
export const SCORE_CHASER = 100;
export const SCORE_BOMB = 25;

// ==================== PLAYER BULLET COLLISION ====================

/**
 * Check player bullets against all enemy entities.
 * Returns remaining bullets (those that didn't hit anything) and total score earned.
 *
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

    // Check vs bombers
    for (const e of enemies) {
      if (!e.alive) continue;
      const dist = Math.hypot(b.x - e.x, b.y - e.y);
      if (dist < ENEMY_SIZE + 5) {
        e.alive = false;
        spawnExplosion(e.x, e.y, 35, SCORE_BOMBER);
        score += SCORE_BOMBER;
        hit = true;
        break;
      }
    }

    // Check vs chasers
    if (!hit) {
      for (const c of chasers) {
        if (!c.alive) continue;
        const dist = Math.hypot(b.x - c.x, b.y - c.y);
        if (dist < CHASER_SIZE + 5) {
          c.alive = false;
          spawnExplosion(c.x, c.y, 30, SCORE_CHASER);
          score += SCORE_CHASER;
          hit = true;
          break;
        }
      }
    }

    // Check vs falling bombs
    if (!hit) {
      for (const bomb of bombs) {
        if (!bomb.alive) continue;
        const dist = Math.hypot(b.x - bomb.x, b.y - bomb.y);
        if (dist < BOMB_SIZE + 5) {
          bomb.alive = false;
          spawnExplosion(bomb.x, bomb.y, 20, SCORE_BOMB);
          score += SCORE_BOMB;
          hit = true;
          break;
        }
      }
    }

    // Check vs homing missiles (can be shot down!)
    if (!hit) {
      for (const m of homingMissiles) {
        if (!m.alive) continue;
        const dist = Math.hypot(b.x - m.x, b.y - m.y);
        if (dist < 8) {
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

// ==================== RENDERING ====================

/**
 * Draws all air enemies, their projectiles, explosions, and score popups.
 * Called within a camera-translated context (world coordinates).
 */
export function drawEnemies(ctx: CanvasRenderingContext2D) {
  // ---- Pink Bombers ----
  for (const e of enemies) {
    if (!e.alive) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.dir === 1 ? 0 : Math.PI); // Face direction of travel

    ctx.shadowColor = "rgba(232, 67, 147, 0.4)";
    ctx.shadowBlur = 10;

    // Fuselage shape
    const s = ENEMY_SIZE;
    ctx.beginPath();
    ctx.moveTo(s * 1.1, 0);
    ctx.lineTo(s * 0.2, -s * 0.5);
    ctx.lineTo(-s * 0.8, -s * 0.55);
    ctx.lineTo(-s * 0.6, 0);
    ctx.lineTo(-s * 0.8, s * 0.55);
    ctx.lineTo(s * 0.2, s * 0.5);
    ctx.closePath();
    ctx.fillStyle = "#e84393";
    ctx.fill();
    ctx.strokeStyle = "#c0306e";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Wing stripes
    ctx.fillStyle = "#d63384";
    ctx.fillRect(-s * 0.5, -s * 0.45, s * 0.6, s * 0.15);
    ctx.fillRect(-s * 0.5, s * 0.3, s * 0.6, s * 0.15);

    // Cockpit
    ctx.beginPath();
    ctx.arc(s * 0.3, 0, s * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = "#fab1d0";
    ctx.fill();

    // Engine glow
    ctx.beginPath();
    ctx.arc(-s * 0.7, 0, s * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#ff6b9d";
    ctx.globalAlpha = 0.6 + Math.sin(performance.now() * 0.01) * 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.shadowColor = "transparent";
    ctx.restore();
  }

  // ---- Red/Orange Chasers ----
  for (const c of chasers) {
    if (!c.alive) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle); // Face direction of travel

    ctx.shadowColor = "rgba(255, 90, 20, 0.4)";
    ctx.shadowBlur = 10;

    // Angular fighter body
    const s = CHASER_SIZE;
    ctx.beginPath();
    ctx.moveTo(s * 1.2, 0);
    ctx.lineTo(s * 0.3, -s * 0.35);
    ctx.lineTo(-s * 0.3, -s * 0.6);
    ctx.lineTo(-s * 0.7, -s * 0.4);
    ctx.lineTo(-s * 0.5, 0);
    ctx.lineTo(-s * 0.7, s * 0.4);
    ctx.lineTo(-s * 0.3, s * 0.6);
    ctx.lineTo(s * 0.3, s * 0.35);
    ctx.closePath();
    ctx.fillStyle = "#e84118";
    ctx.fill();
    ctx.strokeStyle = "#c23616";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Wing triangles
    ctx.fillStyle = "#b71510";
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.5);
    ctx.lineTo(-s * 0.6, -s * 0.5);
    ctx.lineTo(-s * 0.4, -s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, s * 0.5);
    ctx.lineTo(-s * 0.6, s * 0.5);
    ctx.lineTo(-s * 0.4, s * 0.2);
    ctx.closePath();
    ctx.fill();

    // Cockpit visor (orange)
    ctx.beginPath();
    ctx.ellipse(s * 0.4, 0, s * 0.18, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ffc048";
    ctx.fill();

    // Engine flame trails
    ctx.beginPath();
    ctx.arc(-s * 0.6, -s * 0.15, s * 0.08, 0, Math.PI * 2);
    ctx.arc(-s * 0.6, s * 0.15, s * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = "#ff9f43";
    ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.012 + c.x) * 0.4;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.shadowColor = "transparent";
    ctx.restore();
  }

  // ---- Chaser Beam Bullets ----
  for (const cb of chaserBullets) {
    if (!cb.alive) continue;
    const bAngle = Math.atan2(cb.dy, cb.dx);
    ctx.save();
    ctx.translate(cb.x, cb.y);
    ctx.rotate(bAngle);
    // Soft glow layer (cheap fake glow, no shadowBlur)
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -4);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 120, 40, 0.3)";
    ctx.fill();
    // Beam triangle shape
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
    ctx.shadowColor = "transparent";
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

    // Pulsing red glow (cheap fake, no shadowBlur)
    const pulse = 0.7 + Math.sin(performance.now() * 0.02) * 0.3;
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

    // Missile body
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

    // Yellow warhead tip
    ctx.beginPath();
    ctx.arc(7, 0, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffcc00";
    ctx.fill();

    // Tail fins
    ctx.fillStyle = "#cc2222";
    ctx.fillRect(-9, -5, 4, 2);
    ctx.fillRect(-9, 3, 4, 2);

    // Engine flame (randomized for flicker)
    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.lineTo(-14 - Math.random() * 4, 0);
    ctx.lineTo(-10, 2);
    ctx.fillStyle = `rgba(255, 200, 50, ${0.7 + Math.random() * 0.3})`;
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.restore();

    // Warning indicator ring around missile
    ctx.save();
    ctx.beginPath();
    ctx.arc(m.x, m.y, 16 + Math.sin(performance.now() * 0.015) * 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 50, 50, ${0.3 + Math.sin(performance.now() * 0.01) * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ---- Tumbling Bombs ----
  for (const b of bombs) {
    if (!b.alive) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rotation);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(-BOMB_SIZE / 2, -BOMB_SIZE / 2, BOMB_SIZE, BOMB_SIZE);
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-BOMB_SIZE / 2, -BOMB_SIZE / 2, BOMB_SIZE, BOMB_SIZE);
    ctx.restore();
  }

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
