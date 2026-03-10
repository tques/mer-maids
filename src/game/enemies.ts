// Enemy system: pink triangle bombers, tumbling bombs, explosions

import { getWaterSurfaceY } from "./water";

export interface Enemy {
  x: number;
  y: number;
  speed: number;
  dir: 1 | -1; // horizontal direction, never stops
  angle: number;
  targetX: number;
  bombCooldown: number;
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
let bombs: Bomb[] = [];
let explosions: Explosion[] = [];
let spawnTimer = 0;

const ENEMY_SIZE = 16;
const BOMB_SIZE = 8;
const SPAWN_INTERVAL = 2.5; // seconds
const BOMB_INTERVAL = 1.8; // seconds between bombs per enemy
const BOMB_GRAVITY = 0.12;

export function getEnemies() { return enemies; }
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

export function updateEnemies(dt: number, cw: number, ch: number, boatX: number) {
  spawnTimer -= dt;
  const waterY = getWaterSurfaceY(ch);
  const flyZoneY = waterY * 0.15 + Math.random() * waterY * 0.35; // upper portion of sky

  // Spawn new enemies
  if (spawnTimer <= 0) {
    spawnTimer = SPAWN_INTERVAL + Math.random() * 1.5;
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

  // Update enemies — they fly continuously in their direction
  for (const e of enemies) {
    if (!e.alive) continue;
    e.x += e.dir * e.speed;
    e.y += Math.sin(performance.now() * 0.003 + e.x * 0.01) * 0.3;

    // Drop bombs while passing over target zone
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
      });
    }

    // Fly off-screen after passing target → remove
    if (e.x < -60 || e.x > cw + 60) e.alive = false;
  }

  // Update bombs
  for (const b of bombs) {
    if (!b.alive) continue;
    b.vy += BOMB_GRAVITY;
    b.y += b.vy;
    b.rotation += b.rotSpeed * dt;
    // Hit water surface or bottom
    if (b.y > ch + 20) b.alive = false;
  }

  // Update explosions
  for (const ex of explosions) {
    ex.life -= dt / ex.maxLife;
    ex.radius += (ex.maxRadius - ex.radius) * 0.15;
  }

  // Cleanup
  enemies = enemies.filter(e => e.alive);
  bombs = bombs.filter(b => b.alive);
  explosions = explosions.filter(ex => ex.life > 0);
}

export function checkBulletCollisions(bullets: { x: number; y: number; dx: number; dy: number; id: number }[]) {
  const remainingBullets: typeof bullets = [];

  for (const b of bullets) {
    let hit = false;

    // Check against enemies
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
  // Draw enemies (pink triangles)
  for (const e of enemies) {
    if (!e.alive) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    const facing = e.targetX > e.x ? 0 : Math.PI;
    ctx.rotate(facing);

    ctx.beginPath();
    ctx.moveTo(ENEMY_SIZE, 0);
    ctx.lineTo(-ENEMY_SIZE * 0.7, -ENEMY_SIZE * 0.6);
    ctx.lineTo(-ENEMY_SIZE * 0.7, ENEMY_SIZE * 0.6);
    ctx.closePath();
    ctx.fillStyle = "#e84393";
    ctx.fill();
    ctx.restore();
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
    // Outer glow
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 165, 50, ${ex.life * 0.6})`;
    ctx.fill();
    // Inner bright core
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 200, ${ex.life * 0.8})`;
    ctx.fill();
    ctx.restore();
  }
}
