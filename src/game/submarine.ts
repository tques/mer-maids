// Submarine enemy: slow cylinder-shaped underwater unit that attacks the city from below

import { getWaterSurfaceY } from "./water";
import { spawnExplosion } from "./enemies";

export interface Submarine {
  x: number;
  y: number;
  speed: number;
  dir: 1 | -1;
  alive: boolean;
  attacking: boolean;
  attackTimer: number;
  flashTimer: number;
}

let submarines: Submarine[] = [];
let subSpawnTimer = 15;

export function getSubmarines() { return submarines; }

export function resetSubmarines() {
  submarines = [];
  subSpawnTimer = 15;
}

const SUB_WIDTH = 50;
const SUB_HEIGHT = 16;
const SUB_SPEED = 0.6;
const SUB_ATTACK_TIME = 2.0; // seconds to charge before attacking
const SUB_DEPTH_MIN = 50; // minimum depth below water surface
const SUB_DEPTH_MAX = 140; // maximum depth (deep subs encourage diving)

export function updateSubmarines(
  dt: number,
  viewH: number,
  boatX: number,
  boatWidth: number,
  playerX: number,
  viewHalfW: number,
  waveDifficulty: number,
  fleeing: boolean,
  gameTime: number
) {
  const waterY = getWaterSurfaceY(viewH);
  const hw = boatWidth / 2;

  // Spawning
  if (!fleeing && gameTime > 20 / waveDifficulty) {
    subSpawnTimer -= dt;
    const maxSubs = Math.min(1 + Math.floor(waveDifficulty * 0.5), 3);
    const aliveSubs = submarines.filter(s => s.alive).length;
    if (subSpawnTimer <= 0 && aliveSubs < maxSubs) {
      subSpawnTimer = Math.max(18 - waveDifficulty * 3, 8) + Math.random() * 6;
      const fromLeft = Math.random() > 0.5;
      const dir = fromLeft ? 1 : -1;
      const spawnX = fromLeft
        ? boatX - hw - 600 - Math.random() * 400
        : boatX + hw + 600 + Math.random() * 400;
      // Variable depth — some spawn deeper to encourage diving
      const depthOffset = SUB_DEPTH_MIN + Math.random() * (SUB_DEPTH_MAX - SUB_DEPTH_MIN);
      submarines.push({
        x: spawnX,
        y: waterY + depthOffset,
        speed: SUB_SPEED + Math.random() * 0.2,
        dir: dir as 1 | -1,
        alive: true,
        attacking: false,
        attackTimer: 0,
        flashTimer: 0,
      });
    }
  }

  // Update
  for (const sub of submarines) {
    if (!sub.alive) continue;

    if (fleeing) {
      // Flee away from city (reverse direction)
      sub.attacking = false;
      sub.x -= sub.dir * 2.5;
      if (Math.abs(sub.x - playerX) > viewHalfW * 4) sub.alive = false;
      continue;
    }

    // sub keeps its spawn depth

    if (!sub.attacking) {
      // Move toward city
      sub.x += sub.dir * sub.speed;

      // Check if underneath the city
      if (sub.x > boatX - hw * 0.6 && sub.x < boatX + hw * 0.6) {
        sub.attacking = true;
        sub.attackTimer = SUB_ATTACK_TIME;
        sub.speed = 0;
      }

      // Despawn if passed through and way past city
      if ((sub.dir === 1 && sub.x > boatX + hw + 800) ||
          (sub.dir === -1 && sub.x < boatX - hw - 800)) {
        sub.alive = false;
      }
    } else {
      // Charging attack
      sub.attackTimer -= dt;
      sub.flashTimer += dt;
      if (sub.attackTimer <= 0) {
        // Attack! Returns damage via the check function
        sub.alive = false;
        spawnExplosion(sub.x, waterY, 40);
      }
    }
  }

  submarines = submarines.filter(s => s.alive);
}

export function checkSubmarineAttacks(boatX: number, boatWidth: number, viewH: number): number {
  // Already handled in updateSubmarines — this checks for subs that just died while attacking
  // We track via a different mechanism: count explosions from subs
  // Actually, let's make it simpler: mark subs that completed attack
  return 0; // damage is returned from updateSubmarines
}

// Modified update that returns damage dealt
export function updateSubmarinesWithDamage(
  dt: number,
  viewH: number,
  boatX: number,
  boatWidth: number,
  playerX: number,
  viewHalfW: number,
  waveDifficulty: number,
  fleeing: boolean,
  gameTime: number
): number {
  const waterY = getWaterSurfaceY(viewH);
  const hw = boatWidth / 2;
  let damage = 0;

  // Spawning
  if (!fleeing && gameTime > 20 / waveDifficulty) {
    subSpawnTimer -= dt;
    const maxSubs = Math.min(1 + Math.floor(waveDifficulty * 0.5), 3);
    const aliveSubs = submarines.filter(s => s.alive).length;
    if (subSpawnTimer <= 0 && aliveSubs < maxSubs) {
      subSpawnTimer = Math.max(18 - waveDifficulty * 3, 8) + Math.random() * 6;
      const fromLeft = Math.random() > 0.5;
      const dir = fromLeft ? 1 : -1;
      const spawnX = fromLeft
        ? boatX - hw - 600 - Math.random() * 400
        : boatX + hw + 600 + Math.random() * 400;
      const depthOffset = SUB_DEPTH_MIN + Math.random() * (SUB_DEPTH_MAX - SUB_DEPTH_MIN);
      submarines.push({
        x: spawnX,
        y: waterY + depthOffset,
        speed: SUB_SPEED + Math.random() * 0.2,
        dir: dir as 1 | -1,
        alive: true,
        attacking: false,
        attackTimer: 0,
        flashTimer: 0,
      });
    }
  }

  // Update
  for (const sub of submarines) {
    if (!sub.alive) continue;

    if (fleeing) {
      sub.attacking = false;
      sub.x -= sub.dir * 2.5;
      if (Math.abs(sub.x - playerX) > viewHalfW * 4) sub.alive = false;
      continue;
    }

    // sub keeps its spawn depth

    if (!sub.attacking) {
      sub.x += sub.dir * sub.speed;

      if (sub.x > boatX - hw * 0.6 && sub.x < boatX + hw * 0.6) {
        sub.attacking = true;
        sub.attackTimer = SUB_ATTACK_TIME;
        sub.speed = 0;
      }

      if ((sub.dir === 1 && sub.x > boatX + hw + 800) ||
          (sub.dir === -1 && sub.x < boatX - hw - 800)) {
        sub.alive = false;
      }
    } else {
      sub.attackTimer -= dt;
      sub.flashTimer += dt;
      if (sub.attackTimer <= 0) {
        sub.alive = false;
        spawnExplosion(sub.x, waterY, 40);
        damage += 1;
      }
    }
  }

  submarines = submarines.filter(s => s.alive);
  return damage;
}

export function checkBulletHitsSubmarine(bullets: { x: number; y: number; dx: number; dy: number; id: number }[]): { remaining: typeof bullets; score: number } {
  const remaining: typeof bullets = [];
  let score = 0;
  const SCORE_SUB = 200;

  for (const b of bullets) {
    let hit = false;
    for (const sub of submarines) {
      if (!sub.alive) continue;
      // Rectangular hitbox
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

export function drawSubmarines(ctx: CanvasRenderingContext2D) {
  for (const sub of submarines) {
    if (!sub.alive) continue;

    ctx.save();
    ctx.translate(sub.x, sub.y);

    // Cylinder body
    const hw = SUB_WIDTH / 2;
    const hh = SUB_HEIGHT / 2;

    // Main hull — dark metallic
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#2d3436";
    ctx.fill();
    ctx.strokeStyle = "#636e72";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Highlight stripe
    ctx.beginPath();
    ctx.ellipse(0, -2, hw * 0.85, hh * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(99, 110, 114, 0.4)";
    ctx.fill();

    // Conning tower (small bump on top)
    ctx.fillStyle = "#2d3436";
    ctx.fillRect(-6, -hh - 6, 12, 8);
    ctx.strokeStyle = "#636e72";
    ctx.strokeRect(-6, -hh - 6, 12, 8);

    // Direction indicator — front glow
    const frontX = sub.dir * hw * 0.7;
    ctx.beginPath();
    ctx.arc(frontX, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = sub.attacking ? "#e74c3c" : "#74b9ff";
    ctx.fill();

    // Attack warning flash
    if (sub.attacking) {
      const flash = Math.sin(sub.flashTimer * 8) > 0;
      if (flash) {
        ctx.beginPath();
        ctx.ellipse(0, 0, hw + 4, hh + 4, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(231, 76, 60, 0.6)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Rising bubbles
      const bubbleCount = 3;
      for (let i = 0; i < bubbleCount; i++) {
        const bx = (i - 1) * 10 + Math.sin(sub.flashTimer * 3 + i) * 5;
        const by = -hh - 10 - ((sub.flashTimer * 30 + i * 15) % 40);
        ctx.beginPath();
        ctx.arc(bx, by, 2 + Math.random(), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(116, 185, 255, 0.4)";
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

export function fleeSubmarines() {
  for (const sub of submarines) {
    if (sub.alive) {
      sub.attacking = false;
    }
  }
}

export function areSubmarinesGone(): boolean {
  return submarines.filter(s => s.alive).length === 0;
}
