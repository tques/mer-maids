// Enemy system: pink triangle bombers, blue chasers, tumbling bombs, explosions

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
  alive: boolean;
}

export interface ChaserBullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  alive: boolean;
}

export interface Bomb {
  x: number;
  y: number;
  vy: number;
  rotation: number;
  rotSpeed: number;
  alive: boolean;
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
let bombs: Bomb[] = [];
let explosions: Explosion[] = [];
let bomberSpawnTimer = 0;
let chaserSpawnTimer = 3;

const ENEMY_SIZE = 16;
const CHASER_SIZE = 14;
const BOMB_SIZE = 8;
const BOMBER_SPAWN_INTERVAL = 8; // much less frequent
const CHASER_SPAWN_INTERVAL = 5;
const BOMB_INTERVAL = 1.8;
const BOMB_GRAVITY = 0.12;
const CHASER_SPEED = 2.2;
const CHASER_BULLET_SPEED = 4;
const CHASER_SHOOT_INTERVAL = 1.2;

export function getEnemies() { return enemies; }
export function getChasers() { return chasers; }
export function getBombs() { return bombs; }
export function getExplosions() { return explosions; }

export function spawnExplosion(x: number, y: number, size = 30) {
  explosions.push({
    x, y,
    life: 1,
    maxLife: 0.5,
    radius: 4,
    maxRadius: size,
  });
}

export function updateEnemies(dt: number, cw: number, ch: number, boatX: number, boatWidth: number, playerX: number, playerY: number) {
  const waterY = getWaterSurfaceY(ch);

  // --- Bomber spawning (pink, infrequent) ---
  bomberSpawnTimer -= dt;
  if (bomberSpawnTimer <= 0) {
    bomberSpawnTimer = BOMBER_SPAWN_INTERVAL + Math.random() * 4;
    const fromLeft = Math.random() > 0.5;
    const dir = fromLeft ? 1 : -1;
    enemies.push({
      x: fromLeft ? -30 : cw + 30,
      y: 40 + Math.random() * waterY * 0.3,
      speed: 1.2 + Math.random() * 0.8,
      dir: dir as 1 | -1,
      angle: 0,
      targetX: boatX + (Math.random() - 0.5) * cw * 0.3,
      bombCooldown: 0.5 + Math.random(),
      alive: true,
    });
  }

  // Update bombers
  for (const e of enemies) {
    if (!e.alive) continue;
    e.x += e.dir * e.speed;
    e.y += Math.sin(performance.now() * 0.003 + e.x * 0.01) * 0.3;
    e.bombCooldown -= dt;
    if (Math.abs(e.x - e.targetX) < 120 && e.bombCooldown <= 0) {
      e.bombCooldown = BOMB_INTERVAL + Math.random() * 0.5;
      bombs.push({
        x: e.x, y: e.y + ENEMY_SIZE,
        vy: 0, rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 8,
        alive: true,
      });
    }
    if (e.x < -60 || e.x > cw + 60) e.alive = false;
  }

  // --- Chaser spawning (blue, tracks player) ---
  chaserSpawnTimer -= dt;
  if (chaserSpawnTimer <= 0) {
    chaserSpawnTimer = CHASER_SPAWN_INTERVAL + Math.random() * 3;
    const fromLeft = Math.random() > 0.5;
    chasers.push({
      x: fromLeft ? -30 : cw + 30,
      y: 40 + Math.random() * waterY * 0.5,
      speed: CHASER_SPEED,
      angle: 0,
      shootCooldown: 1 + Math.random(),
      alive: true,
    });
  }

  // Update chasers — they chase the player
  for (const c of chasers) {
    if (!c.alive) continue;
    const targetAngle = Math.atan2(playerY - c.y, playerX - c.x);
    // Smooth angle turning
    let angleDiff = targetAngle - c.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    c.angle += angleDiff * 0.04; // slow turning

    c.x += Math.cos(c.angle) * c.speed;
    c.y += Math.sin(c.angle) * c.speed;

    // Shoot at player
    c.shootCooldown -= dt;
    if (c.shootCooldown <= 0) {
      c.shootCooldown = CHASER_SHOOT_INTERVAL + Math.random() * 0.5;
      chaserBullets.push({
        x: c.x + Math.cos(c.angle) * (CHASER_SIZE + 4),
        y: c.y + Math.sin(c.angle) * (CHASER_SIZE + 4),
        dx: Math.cos(c.angle) * CHASER_BULLET_SPEED,
        dy: Math.sin(c.angle) * CHASER_BULLET_SPEED,
        alive: true,
      });
    }

    // Remove if too far off-screen
    if (c.x < -200 || c.x > cw + 200 || c.y < -200 || c.y > ch + 200) c.alive = false;
  }

  // Update chaser bullets
  for (const cb of chaserBullets) {
    if (!cb.alive) continue;
    cb.x += cb.dx;
    cb.y += cb.dy;
    if (cb.x < -10 || cb.x > cw + 10 || cb.y < -10 || cb.y > ch + 10) cb.alive = false;
  }

  // Update bombs
  for (const b of bombs) {
    if (!b.alive) continue;
    b.vy += BOMB_GRAVITY;
    b.y += b.vy;
    b.rotation += b.rotSpeed * dt;
    if (b.y > ch + 20) b.alive = false;
  }

  // Update explosions
  for (const ex of explosions) {
    ex.life -= dt / ex.maxLife;
    ex.radius += (ex.maxRadius - ex.radius) * 0.15;
  }

  // Cleanup
  enemies = enemies.filter(e => e.alive);
  chasers = chasers.filter(c => c.alive);
  chaserBullets = chaserBullets.filter(cb => cb.alive);
  bombs = bombs.filter(b => b.alive);
  explosions = explosions.filter(ex => ex.life > 0);
}

export function checkBulletCollisions(bullets: { x: number; y: number; dx: number; dy: number; id: number }[]) {
  const remainingBullets: typeof bullets = [];

  for (const b of bullets) {
    let hit = false;

    // Check against bombers
    for (const e of enemies) {
      if (!e.alive) continue;
      const dist = Math.hypot(b.x - e.x, b.y - e.y);
      if (dist < ENEMY_SIZE + 5) {
        e.alive = false;
        spawnExplosion(e.x, e.y, 35);
        hit = true;
        break;
      }
    }

    // Check against chasers
    if (!hit) {
      for (const c of chasers) {
        if (!c.alive) continue;
        const dist = Math.hypot(b.x - c.x, b.y - c.y);
        if (dist < CHASER_SIZE + 5) {
          c.alive = false;
          spawnExplosion(c.x, c.y, 30);
          hit = true;
          break;
        }
      }
    }

    // Check against bombs
    if (!hit) {
      for (const bomb of bombs) {
        if (!bomb.alive) continue;
        const dist = Math.hypot(b.x - bomb.x, b.y - bomb.y);
        if (dist < BOMB_SIZE + 5) {
          bomb.alive = false;
          spawnExplosion(bomb.x, bomb.y, 20);
          hit = true;
          break;
        }
      }
    }

    if (!hit) remainingBullets.push(b);
  }

  return remainingBullets;
}

export function drawEnemies(ctx: CanvasRenderingContext2D) {
  // Draw bombers (pink triangles)
  for (const e of enemies) {
    if (!e.alive) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.dir === 1 ? 0 : Math.PI);
    ctx.beginPath();
    ctx.moveTo(ENEMY_SIZE, 0);
    ctx.lineTo(-ENEMY_SIZE * 0.7, -ENEMY_SIZE * 0.6);
    ctx.lineTo(-ENEMY_SIZE * 0.7, ENEMY_SIZE * 0.6);
    ctx.closePath();
    ctx.fillStyle = "#e84393";
    ctx.fill();
    ctx.restore();
  }

  // Draw chasers (blue triangles)
  for (const c of chasers) {
    if (!c.alive) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.beginPath();
    ctx.moveTo(CHASER_SIZE, 0);
    ctx.lineTo(-CHASER_SIZE * 0.7, -CHASER_SIZE * 0.6);
    ctx.lineTo(-CHASER_SIZE * 0.7, CHASER_SIZE * 0.6);
    ctx.closePath();
    ctx.fillStyle = "#0984e3";
    ctx.fill();
    ctx.restore();
  }

  // Draw chaser bullets (small blue dots)
  ctx.fillStyle = "#74b9ff";
  for (const cb of chaserBullets) {
    if (!cb.alive) continue;
    ctx.beginPath();
    ctx.arc(cb.x, cb.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw bombs (tumbling squares)
  for (const b of bombs) {
    if (!b.alive) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rotation);
    ctx.fillStyle = "#2d3436";
    ctx.fillRect(-BOMB_SIZE / 2, -BOMB_SIZE / 2, BOMB_SIZE, BOMB_SIZE);
    ctx.strokeStyle = "#636e72";
    ctx.lineWidth = 1;
    ctx.strokeRect(-BOMB_SIZE / 2, -BOMB_SIZE / 2, BOMB_SIZE, BOMB_SIZE);
    ctx.restore();
  }

  // Draw explosions
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
}
