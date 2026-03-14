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

    const hw = SUB_WIDTH / 2;
    const hh = SUB_HEIGHT / 2;

    // Menacing red glow
    ctx.shadowColor = sub.attacking ? "rgba(255, 30, 10, 0.7)" : "rgba(200, 50, 30, 0.4)";
    ctx.shadowBlur = 12;

    // Main hull — dark gunmetal
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();
    ctx.strokeStyle = "#4a0e0e";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Danger stripe — crimson band across center
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.92, hh * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#6b0000";
    ctx.fill();

    // Inner hull dark
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.75, hh * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();

    // Conning tower — angular, weaponized
    ctx.beginPath();
    ctx.moveTo(-7, -hh);
    ctx.lineTo(-5, -hh - 9);
    ctx.lineTo(5, -hh - 9);
    ctx.lineTo(7, -hh);
    ctx.closePath();
    ctx.fillStyle = "#2d0a0a";
    ctx.fill();
    ctx.strokeStyle = "#8b0000";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Antenna / sensor mast
    ctx.beginPath();
    ctx.moveTo(0, -hh - 9);
    ctx.lineTo(0, -hh - 15);
    ctx.strokeStyle = "#cc0000";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Blinking sensor tip
    const sensorBlink = Math.sin(performance.now() * 0.008 + sub.x) > 0;
    if (sensorBlink) {
      ctx.beginPath();
      ctx.arc(0, -hh - 15, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff0000";
      ctx.fill();
    }

    // Nose — armored ram
    const noseX = sub.dir * hw;
    ctx.beginPath();
    ctx.moveTo(noseX, -hh * 0.6);
    ctx.lineTo(noseX + sub.dir * 8, 0);
    ctx.lineTo(noseX, hh * 0.6);
    ctx.closePath();
    ctx.fillStyle = "#4a0e0e";
    ctx.fill();

    // Hostile eye — glowing red porthole
    const eyeX = sub.dir * hw * 0.35;
    ctx.beginPath();
    ctx.arc(eyeX, 0, 3.5, 0, Math.PI * 2);
    const eyePulse = 0.6 + Math.sin(performance.now() * 0.006) * 0.4;
    ctx.fillStyle = sub.attacking ? "#ff0000" : `rgba(255, 40, 20, ${eyePulse})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX, 0, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffcc00";
    ctx.fill();

    // Tail fin — jagged
    const tailX = -sub.dir * hw * 0.85;
    ctx.beginPath();
    ctx.moveTo(tailX, -hh * 0.4);
    ctx.lineTo(tailX - sub.dir * 8, -hh - 5);
    ctx.lineTo(tailX - sub.dir * 4, -hh * 0.1);
    ctx.lineTo(tailX - sub.dir * 8, hh + 5);
    ctx.lineTo(tailX, hh * 0.4);
    ctx.closePath();
    ctx.fillStyle = "#6b0000";
    ctx.fill();

    // Torpedo tube marks
    const tubeX = sub.dir * hw * 0.6;
    ctx.fillStyle = "#333";
    ctx.fillRect(tubeX - 1, -hh * 0.5, 2, 3);
    ctx.fillRect(tubeX - 1, hh * 0.5 - 3, 2, 3);

    ctx.shadowColor = "transparent";

    // Attack warning flash
    if (sub.attacking) {
      const flash = Math.sin(sub.flashTimer * 10) > 0;
      if (flash) {
        ctx.beginPath();
        ctx.ellipse(0, 0, hw + 6, hh + 6, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 0, 0, 0.7)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Menacing rising bubbles — reddish
      for (let i = 0; i < 4; i++) {
        const bx = (i - 1.5) * 8 + Math.sin(sub.flashTimer * 4 + i) * 4;
        const by = -hh - 12 - ((sub.flashTimer * 35 + i * 12) % 50);
        ctx.beginPath();
        ctx.arc(bx, by, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 80, 50, ${0.3 + Math.random() * 0.3})`;
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
