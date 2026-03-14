// Enemy system: pink bombers, blue chasers, homing missiles, tumbling bombs, explosions

import { getWaterSurfaceY } from "./water";

export interface Enemy {
  x: number;
  y: number;
  speed: number;
  dir: 1 | -1;
  angle: number;
  targetX: number;
  bombCooldown: number;
  alive: boolean;
}

export interface Chaser {
  x: number;
  y: number;
  speed: number;
  angle: number;
  shootCooldown: number;
  missileCooldown: number;
  alive: boolean;
}

export interface ChaserBullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  alive: boolean;
}

export interface HomingMissile {
  x: number;
  y: number;
  angle: number;
  speed: number;
  life: number;
  alive: boolean;
  trail: { x: number; y: number; age: number }[];
}

export interface Bomb {
  x: number;
  y: number;
  vy: number;
  rotation: number;
  rotSpeed: number;
  alive: boolean;
  hangTime: number;
}

export interface Explosion {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  maxRadius: number;
}

let enemies: Enemy[] = [];
let chasers: Chaser[] = [];
let chaserBullets: ChaserBullet[] = [];
let homingMissiles: HomingMissile[] = [];
let bombs: Bomb[] = [];
let explosions: Explosion[] = [];
let bomberSpawnTimer = 0;
let chaserSpawnTimer = 3;
let gameTime = 0;

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

const ENEMY_SIZE = 16;
const CHASER_SIZE = 14;
const BOMB_SIZE = 14;
const BOMB_INTERVAL = 1.8;
const BOMB_GRAVITY = 0.025;
const CHASER_SPEED = 2.2;
const CHASER_BULLET_SPEED = 4;
const CHASER_SHOOT_INTERVAL = 1.2;
const MISSILE_SPEED = 3.5;
const MISSILE_TURN_RATE = 0.045;
const MISSILE_LIFETIME = 6; // seconds

export function getEnemies() { return enemies; }
export function getChasers() { return chasers; }
export function getChaserBullets() { return chaserBullets; }
export function getHomingMissiles() { return homingMissiles; }
export function getBombs() { return bombs; }
export function getExplosions() { return explosions; }

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

/** Check homing missiles hitting player. Returns number of hits. */
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

/** Deflect all active homing missiles — called when player rolls or boosts */
export function deflectMissiles() {
  for (const m of homingMissiles) {
    if (!m.alive) continue;
    // Knock the missile wildly off course
    m.angle += (Math.random() - 0.5) * Math.PI * 1.5;
    m.speed *= 0.6;
    m.life = Math.min(m.life, 1.2); // expire soon
  }
}

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

export interface ScorePopup {
  x: number;
  y: number;
  value: number;
  life: number;
}

let scorePopups: ScorePopup[] = [];

export function getScorePopups() { return scorePopups; }

export function spawnExplosion(x: number, y: number, size = 30, scoreValue?: number) {
  explosions.push({
    x, y,
    life: 1,
    maxLife: 0.5,
    radius: 4,
    maxRadius: size,
  });
  if (scoreValue && scoreValue > 0) {
    scorePopups.push({ x, y, value: scoreValue, life: 1.0 });
  }
}

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
  // Kill all missiles when fleeing
  for (const m of homingMissiles) m.alive = false;
}

export function areEnemiesGone(): boolean {
  return enemies.filter(e => e.alive).length === 0 &&
    chasers.filter(c => c.alive).length === 0;
}

export function updateEnemies(
  dt: number, worldWidth: number, viewH: number,
  boatX: number, boatWidth: number,
  playerX: number, playerY: number,
  viewHalfW: number,
  waveDifficulty: number = 1,
  fleeing: boolean = false
) {
  const waterY = getWaterSurfaceY(viewH);
  gameTime += dt;

  const timeDifficulty = Math.min(gameTime / 180, 1);
  const difficulty = Math.min(timeDifficulty * waveDifficulty, 2.5);

  // Don't spawn if fleeing
  if (!fleeing) {
    // --- Bomber spawning (pink) ---
    const bomberInterval = Math.max((20 - difficulty * 7), 3);
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
        speed: 1.2 + Math.random() * 0.8,
        dir: dir as 1 | -1,
        angle: 0,
        targetX: boatX + (Math.random() - 0.5) * viewHalfW,
        bombCooldown: 0.5 + Math.random(),
        alive: true,
      });
    }
  }

  // Update bombers
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
      e.y += Math.sin(performance.now() * 0.003 + e.x * 0.01) * 0.3;
    }
    e.x += e.dir * e.speed;
    e.bombCooldown -= dt;
    if (Math.abs(e.x - e.targetX) < 120 && e.bombCooldown <= 0) {
      e.bombCooldown = BOMB_INTERVAL + Math.random() * 0.5;
      bombs.push({
        x: e.x, y: e.y + ENEMY_SIZE,
        vy: 0, rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 8,
        alive: true,
        hangTime: 0.5 + Math.random() * 0.3,
      });
    }
    if (Math.abs(e.x - playerX) > viewHalfW * 4) e.alive = false;
  }

  // --- Chaser spawning (blue) ---
  const maxChasers = fleeing ? 0 : (gameTime < 8 / waveDifficulty ? 0 : Math.min(1 + Math.floor(difficulty * 3), 8));
  const chaserInterval = Math.max((12 - difficulty * 4), 2);
  chaserSpawnTimer -= dt;
  const aliveChasers = chasers.filter(c => c.alive).length;
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
      missileCooldown: 8 + Math.random() * 6, // first missile delayed
      alive: true,
    });
  }

  // Update chasers
  const playerSubmerged = playerY > waterY;
  const waterCeiling = waterY - CHASER_SIZE * 6;

  for (const c of chasers) {
    if (!c.alive) continue;

    if (fleeing) {
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

    const distToPlayer = Math.hypot(playerX - c.x, playerY - c.y);
    const VISION_RANGE = 350;
    const playerVisible = !playerSubmerged && distToPlayer < VISION_RANGE;

    let targetX: number;
    let targetY: number;

    if (!playerVisible) {
      if (!(c as any)._patrolDir) (c as any)._patrolDir = c.x < playerX ? 1 : -1;
      if (!(c as any)._patrolAlt) (c as any)._patrolAlt = waterCeiling - 60 - Math.random() * 80;

      const patrolDir = (c as any)._patrolDir as number;
      targetX = c.x + patrolDir * 200;
      targetY = (c as any)._patrolAlt as number;

      if (c.x < playerX - viewHalfW) (c as any)._patrolDir = 1;
      else if (c.x > playerX + viewHalfW) (c as any)._patrolDir = -1;
    } else {
      (c as any)._patrolDir = null;
      (c as any)._patrolAlt = null;
      targetX = playerX;
      targetY = Math.min(playerY, waterCeiling);
    }

    const targetAngle = Math.atan2(targetY - c.y, targetX - c.x);
    let angleDiff = targetAngle - c.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    c.angle += angleDiff * (playerVisible ? 0.04 : 0.03);

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

    // Homing missile launch — rare, more frequent at higher waves
    c.missileCooldown -= dt;
    const missileInterval = Math.max(18 - waveDifficulty * 4, 5); // wave1=14s, wave5=2s
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

    if (Math.abs(c.x - playerX) > viewHalfW * 4) c.alive = false;
  }

  // Update chaser bullets
  for (const cb of chaserBullets) {
    if (!cb.alive) continue;
    cb.x += cb.dx;
    cb.y += cb.dy;
    if (cb.y < -10 || cb.y > viewH + 10 || Math.abs(cb.x - playerX) > viewHalfW * 3) cb.alive = false;
  }

  // Update homing missiles
  for (const m of homingMissiles) {
    if (!m.alive) continue;
    m.life -= dt;
    if (m.life <= 0) {
      m.alive = false;
      spawnExplosion(m.x, m.y, 20);
      continue;
    }
    // Home toward player
    const targetAngle = Math.atan2(playerY - m.y, playerX - m.x);
    let angleDiff = targetAngle - m.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    m.angle += angleDiff * MISSILE_TURN_RATE;
    m.x += Math.cos(m.angle) * m.speed;
    m.y += Math.sin(m.angle) * m.speed;
    // Trail
    m.trail.push({ x: m.x, y: m.y, age: 0 });
    for (const t of m.trail) t.age += dt;
    m.trail = m.trail.filter(t => t.age < 0.5);
    // Cull off-screen
    if (Math.abs(m.x - playerX) > viewHalfW * 4) m.alive = false;
  }

  // Update bombs
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

  // Update explosions
  for (const ex of explosions) {
    ex.life -= dt / ex.maxLife;
    ex.radius += (ex.maxRadius - ex.radius) * 0.15;
  }

  // Update score popups
  for (const sp of scorePopups) {
    sp.life -= dt * 1.2;
    sp.y -= 0.8;
  }

  // Cleanup
  enemies = enemies.filter(e => e.alive);
  chasers = chasers.filter(c => c.alive);
  chaserBullets = chaserBullets.filter(cb => cb.alive);
  homingMissiles = homingMissiles.filter(m => m.alive);
  bombs = bombs.filter(b => b.alive);
  explosions = explosions.filter(ex => ex.life > 0);
  scorePopups = scorePopups.filter(sp => sp.life > 0);
}

export const SCORE_BOMBER = 150;
export const SCORE_CHASER = 100;
export const SCORE_BOMB = 25;

export function checkBulletCollisions(bullets: { x: number; y: number; dx: number; dy: number; id: number }[]): { remaining: typeof bullets; score: number } {
  const remainingBullets: typeof bullets = [];
  let score = 0;

  for (const b of bullets) {
    let hit = false;

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

    // Shoot down homing missiles
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

export function drawEnemies(ctx: CanvasRenderingContext2D) {
  // --- Pink Bombers (detailed) ---
  for (const e of enemies) {
    if (!e.alive) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.dir === 1 ? 0 : Math.PI);

    // Shadow
    ctx.shadowColor = "rgba(232, 67, 147, 0.4)";
    ctx.shadowBlur = 10;

    // Main fuselage
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

  // --- Red/Orange Chasers (detailed) ---
  for (const c of chasers) {
    if (!c.alive) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);

    // Shadow
    ctx.shadowColor = "rgba(255, 90, 20, 0.4)";
    ctx.shadowBlur = 10;

    // Main body — angular fighter shape
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

    // Wing detail
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

    // Cockpit visor
    ctx.beginPath();
    ctx.ellipse(s * 0.4, 0, s * 0.18, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ffc048";
    ctx.fill();

    // Engine trails — orange flame
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

  // --- Chaser bullets (beam-like) ---
  for (const cb of chaserBullets) {
    if (!cb.alive) continue;
    const bAngle = Math.atan2(cb.dy, cb.dx);
    ctx.save();
    ctx.translate(cb.x, cb.y);
    ctx.rotate(bAngle);
    // Outer glow
    ctx.shadowColor = "rgba(255, 120, 40, 0.8)";
    ctx.shadowBlur = 8;
    // Beam shape
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -2);
    ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fillStyle = "#ff6b35";
    ctx.fill();
    // Core
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

  // --- Homing Missiles (very obvious) ---
  for (const m of homingMissiles) {
    if (!m.alive) continue;

    // Draw trail first
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

    // Pulsing glow — makes it very visible
    const pulse = 0.7 + Math.sin(performance.now() * 0.02) * 0.3;
    ctx.shadowColor = `rgba(255, 60, 60, ${pulse})`;
    ctx.shadowBlur = 18;

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

    // Warhead tip
    ctx.beginPath();
    ctx.arc(7, 0, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffcc00";
    ctx.fill();

    // Fins
    ctx.fillStyle = "#cc2222";
    ctx.fillRect(-9, -5, 4, 2);
    ctx.fillRect(-9, 3, 4, 2);

    // Engine flame
    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.lineTo(-14 - Math.random() * 4, 0);
    ctx.lineTo(-10, 2);
    ctx.fillStyle = `rgba(255, 200, 50, ${0.7 + Math.random() * 0.3})`;
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.restore();

    // Warning indicator ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(m.x, m.y, 16 + Math.sin(performance.now() * 0.015) * 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 50, 50, ${0.3 + Math.sin(performance.now() * 0.01) * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // --- Bombs ---
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

  // --- Explosions ---
  for (const ex of explosions) {
    ctx.save();
    ctx.globalAlpha = ex.life;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 165, 50, ${ex.life * 0.6})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 200, ${ex.life * 0.8})`;
    ctx.fill();
    ctx.restore();
  }

  // --- Score popups ---
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
