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
let bombs: Bomb[] = [];
let explosions: Explosion[] = [];
let bomberSpawnTimer = 0;
let chaserSpawnTimer = 3;
let gameTime = 0;

export function resetEnemies() {
  enemies = [];
  chasers = [];
  chaserBullets = [];
  bombs = [];
  explosions = [];
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

export function getEnemies() { return enemies; }
export function getChasers() { return chasers; }
export function getChaserBullets() { return chaserBullets; }
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

export function checkBombHitsShip(boatX: number, boatWidth: number, shipY: number): number {
  let hits = 0;
  const hw = boatWidth / 2;
  for (const b of bombs) {
    if (!b.alive) continue;
    if (b.y > shipY - 10 && b.y < shipY + 20 && b.x > boatX - hw && b.x < boatX + hw) {
      b.alive = false;
      spawnExplosion(b.x, b.y, 25);
      hits++;
    }
  }
  return hits;
}

export function spawnExplosion(x: number, y: number, size = 30) {
  explosions.push({
    x, y,
    life: 1,
    maxLife: 0.5,
    radius: 4,
    maxRadius: size,
  });
}

export function updateEnemies(
  dt: number, worldWidth: number, viewH: number,
  boatX: number, boatWidth: number,
  playerX: number, playerY: number,
  viewHalfW: number
) {
  const waterY = getWaterSurfaceY(viewH);
  gameTime += dt;

  const difficulty = Math.min(gameTime / 180, 1);

  // --- Bomber spawning (pink) ---
  const bomberInterval = 20 - difficulty * 14;
  bomberSpawnTimer -= dt;
  if (bomberSpawnTimer <= 0 && gameTime > 15) {
    bomberSpawnTimer = bomberInterval + Math.random() * 4;
    const fromLeft = Math.random() > 0.5;
    const dir = fromLeft ? 1 : -1;
    // Spawn just off-camera relative to player
    const spawnX = fromLeft
      ? playerX - viewHalfW - 80
      : playerX + viewHalfW + 80;
    enemies.push({
      x: spawnX,
      y: 40 + Math.random() * waterY * 0.3,
      speed: 1.2 + Math.random() * 0.8,
      dir: dir as 1 | -1,
      angle: 0,
      targetX: boatX + (Math.random() - 0.5) * viewHalfW,
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
        hangTime: 0.5 + Math.random() * 0.3,
      });
    }
    // Despawn if far from player
    if (Math.abs(e.x - playerX) > viewHalfW * 4) e.alive = false;
  }

  // --- Chaser spawning (blue) ---
  const maxChasers = gameTime < 10 ? 0 : Math.min(1 + Math.floor(difficulty * 2), 3);
  const chaserInterval = 12 - difficulty * 7;
  chaserSpawnTimer -= dt;
  const aliveChasers = chasers.filter(c => c.alive).length;
  if (chaserSpawnTimer <= 0 && aliveChasers < maxChasers) {
    chaserSpawnTimer = chaserInterval + Math.random() * 3;
    const fromLeft = Math.random() > 0.5;
    const spawnX = fromLeft
      ? playerX - viewHalfW - 80
      : playerX + viewHalfW + 80;
    chasers.push({
      x: spawnX,
      y: 40 + Math.random() * waterY * 0.5,
      speed: CHASER_SPEED,
      angle: 0,
      shootCooldown: 2 + Math.random(),
      alive: true,
    });
  }

  // Update chasers
  const playerSubmerged = playerY > waterY;
  const waterCeiling = waterY - CHASER_SIZE * 6;

  for (const c of chasers) {
    if (!c.alive) continue;

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

      // Patrol within view range of player
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

    // Despawn if far from player
    if (Math.abs(c.x - playerX) > viewHalfW * 4) c.alive = false;
  }

  // Update chaser bullets
  for (const cb of chaserBullets) {
    if (!cb.alive) continue;
    cb.x += cb.dx;
    cb.y += cb.dy;
    if (cb.y < -10 || cb.y > viewH + 10 || Math.abs(cb.x - playerX) > viewHalfW * 3) cb.alive = false;
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

  ctx.fillStyle = "#74b9ff";
  for (const cb of chaserBullets) {
    if (!cb.alive) continue;
    ctx.beginPath();
    ctx.arc(cb.x, cb.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

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
