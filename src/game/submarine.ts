/**
 * submarine.ts — Underwater Enemy System
 *
 * sonarAlive flag: when false (Port Astra sonar destroyed), submarines spawn
 * dramatically closer to the target city and with a faster attack timer,
 * giving the player far less time to intercept.
 */

import { getWaterSurfaceY } from "./water";
import { spawnExplosion } from "./effects";

export interface Submarine {
  x: number;
  y: number;
  targetY: number;
  speed: number;
  dir: 1 | -1;
  alive: boolean;
  attacking: boolean;
  attackTimer: number;
  flashTimer: number;
}

let submarines: Submarine[] = [];
let subSpawnTimer = 30;
let subTargetCityIndex = 1;

const SUB_WIDTH = 50;
const SUB_HEIGHT = 16;
const SUB_SPEED = 0.35;
const SUB_ATTACK_TIME = 4.5;
const SUB_ATTACK_TIME_NO_SONAR = 2.0; // faster attack when sonar is down
const SUB_DEPTH_MIN = 50;
const SUB_DEPTH_MAX = 140;
const SUB_SPAWN_DEPTH = 350;
const SUB_RISE_SPEED = 0.4;

// Normal spawn distance outside city half-width
const SUB_SPAWN_DIST_NORMAL_MIN = 600;
const SUB_SPAWN_DIST_NORMAL_MAX = 1000; // random(400) added

// Reduced spawn distance when sonar is down — already nearly under the city
const SUB_SPAWN_DIST_NO_SONAR_MIN = 120;
const SUB_SPAWN_DIST_NO_SONAR_MAX = 240;

export function getSubmarines() {
  return submarines;
}

export function setSubmarineTargetCity(index: number) {
  subTargetCityIndex = index;
}
export function getSubmarineTargetCityIndex() {
  return subTargetCityIndex;
}

export function resetSubmarines() {
  submarines = [];
  subSpawnTimer = 30;
}

export function updateSubmarinesWithDamage(
  dt: number,
  viewH: number,
  cities: { x: number; width: number }[],
  playerX: number,
  viewHalfW: number,
  waveDifficulty: number,
  fleeing: boolean,
  gameTime: number,
  /** Pass false when Port Astra's sonar array is destroyed */
  sonarAlive: boolean = true,
): number {
  const waterY = getWaterSurfaceY(viewH);

  const targetCity = cities[subTargetCityIndex] ?? cities[0];
  const boatX = targetCity.x;
  const boatWidth = targetCity.width;
  const hw = boatWidth / 2;

  let damage = 0;

  // ---- Spawning ----
  if (!fleeing && gameTime > 20 / waveDifficulty) {
    subSpawnTimer -= dt;
    const maxSubs = 1;
    const aliveSubs = submarines.filter((s) => s.alive).length;
    if (subSpawnTimer <= 0 && aliveSubs < maxSubs) {
      subSpawnTimer = Math.max(35 - waveDifficulty * 2, 20) + Math.random() * 10;
      const fromLeft = Math.random() > 0.5;
      const dir = fromLeft ? 1 : -1;

      // With sonar down subs spawn very close — player has maybe 15-20s to react
      let spawnDist: number;
      if (sonarAlive) {
        spawnDist = SUB_SPAWN_DIST_NORMAL_MIN + Math.random() * (SUB_SPAWN_DIST_NORMAL_MAX - SUB_SPAWN_DIST_NORMAL_MIN);
      } else {
        spawnDist =
          SUB_SPAWN_DIST_NO_SONAR_MIN + Math.random() * (SUB_SPAWN_DIST_NO_SONAR_MAX - SUB_SPAWN_DIST_NO_SONAR_MIN);
      }

      const spawnX = fromLeft ? boatX - hw - spawnDist : boatX + hw + spawnDist;
      const depthOffset = SUB_DEPTH_MIN + Math.random() * (SUB_DEPTH_MAX - SUB_DEPTH_MIN);

      submarines.push({
        x: spawnX,
        y: waterY + SUB_SPAWN_DEPTH,
        targetY: waterY + depthOffset,
        speed: SUB_SPEED + Math.random() * 0.1,
        dir: dir as 1 | -1,
        alive: true,
        attacking: false,
        attackTimer: 0,
        flashTimer: 0,
      });
    }
  }

  // ---- Movement & Attack ----
  for (const sub of submarines) {
    if (!sub.alive) continue;

    if (fleeing) {
      sub.attacking = false;
      sub.x -= sub.dir * 2.5;
      if (Math.abs(sub.x - playerX) > viewHalfW * 4) sub.alive = false;
      continue;
    }

    if (sub.y > sub.targetY) {
      sub.y -= SUB_RISE_SPEED;
      if (sub.y < sub.targetY) sub.y = sub.targetY;
    }

    if (!sub.attacking) {
      sub.x += sub.dir * sub.speed;

      if (sub.x > boatX - hw * 0.6 && sub.x < boatX + hw * 0.6) {
        sub.attacking = true;
        // Shorter fuse when sonar is down
        sub.attackTimer = sonarAlive ? SUB_ATTACK_TIME : SUB_ATTACK_TIME_NO_SONAR;
        sub.speed = 0;
      }

      if ((sub.dir === 1 && sub.x > boatX + hw + 800) || (sub.dir === -1 && sub.x < boatX - hw - 800)) {
        sub.alive = false;
      }
    } else {
      sub.attackTimer -= dt;
      sub.flashTimer += dt;
      if (sub.attackTimer <= 0) {
        sub.alive = false;
        spawnExplosion(sub.x, waterY, 40);
        damage += 3;
      }
    }
  }

  submarines = submarines.filter((s) => s.alive);
  return damage;
}

export function checkBulletHitsSubmarine(bullets: { x: number; y: number; dx: number; dy: number; id: number }[]): {
  remaining: typeof bullets;
  score: number;
} {
  const remaining: typeof bullets = [];
  let score = 0;
  const SCORE_SUB = 200;

  for (const b of bullets) {
    let hit = false;
    for (const sub of submarines) {
      if (!sub.alive) continue;
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

    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    const hullGrad = ctx.createLinearGradient(0, -hh, 0, hh);
    hullGrad.addColorStop(0, "#2a2a2a");
    hullGrad.addColorStop(0.5, "#151515");
    hullGrad.addColorStop(1, "#1a1a1a");
    ctx.fillStyle = hullGrad;
    ctx.fill();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = "rgba(100, 100, 100, 0.25)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.5, -hh);
    ctx.lineTo(-hw * 0.5, hh);
    ctx.moveTo(hw * 0.2, -hh);
    ctx.lineTo(hw * 0.2, hh);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.92, hh * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#5a0000";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.75, hh * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#151515";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-8, -hh);
    ctx.lineTo(-6, -hh - 10);
    ctx.lineTo(6, -hh - 10);
    ctx.lineTo(8, -hh);
    ctx.closePath();
    ctx.fillStyle = "#222";
    ctx.fill();
    ctx.strokeStyle = "#600";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -hh - 10);
    ctx.lineTo(0, -hh - 16);
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const sensorBlink = Math.sin(performance.now() * 0.008 + sub.x) > 0;
    if (sensorBlink) {
      ctx.beginPath();
      ctx.arc(0, -hh - 16, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff0000";
      ctx.fill();
    }

    const noseX = sub.dir * hw;
    ctx.beginPath();
    ctx.moveTo(noseX, -hh * 0.6);
    ctx.lineTo(noseX + sub.dir * 10, 0);
    ctx.lineTo(noseX, hh * 0.6);
    ctx.closePath();
    ctx.fillStyle = "#333";
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    const eyeX = sub.dir * hw * 0.35;
    ctx.beginPath();
    ctx.arc(eyeX, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX, 0, 3, 0, Math.PI * 2);
    const eyePulse = 0.6 + Math.sin(performance.now() * 0.006) * 0.4;
    ctx.fillStyle = sub.attacking ? "#ff0000" : `rgba(255, 30, 10, ${eyePulse})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX, 0, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    const tailX = -sub.dir * hw * 0.85;
    ctx.beginPath();
    ctx.moveTo(tailX, -hh * 0.4);
    ctx.lineTo(tailX - sub.dir * 9, -hh - 6);
    ctx.lineTo(tailX - sub.dir * 5, -hh * 0.1);
    ctx.lineTo(tailX - sub.dir * 9, hh + 6);
    ctx.lineTo(tailX, hh * 0.4);
    ctx.closePath();
    ctx.fillStyle = "#3a0000";
    ctx.fill();

    const tubeX = sub.dir * hw * 0.6;
    ctx.fillStyle = "#333";
    ctx.fillRect(tubeX - 1, -hh * 0.5, 2, 3);
    ctx.fillRect(tubeX - 1, hh * 0.5 - 3, 2, 3);

    if (sub.attacking) {
      const flash = Math.sin(sub.flashTimer * 10) > 0;
      if (flash) {
        ctx.beginPath();
        ctx.ellipse(0, 0, hw + 6, hh + 6, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 0, 0, 0.7)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
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
    if (sub.alive) sub.attacking = false;
  }
}

export function areSubmarinesGone(): boolean {
  return submarines.filter((s) => s.alive).length === 0;
}

// ==================== BOMBARDMENT SUBMARINE ====================
// Pops straight up from below the screen near the target structure,
// surfaces for 3 seconds, fires a mortar, then sinks back down.
// Completely vertical movement — unique among all enemies.
// Only spawns when bomber target city's structure is alive.
// Mortars do NOT hit city barriers.

export interface BombardSub {
  x: number;
  y: number;
  alive: boolean;
  phase: "rising" | "aiming" | "firing" | "sinking";
  phaseTimer: number;
  targetStructureX: number;
  targetStructureY: number;
  surfaceY: number;
}

export interface Mortar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  trail: { x: number; y: number }[];
  targetX: number;
  targetY: number;
}

let bombardSubs: BombardSub[] = [];
let mortars: Mortar[] = [];
let bombardSpawnTimer = 45;

const BOMBARD_RISE_SPEED = 1.2;
const BOMBARD_SINK_SPEED = 1.8;
const BOMBARD_SPAWN_DEPTH = 600; // far below screen so it always rises from off-screen
const BOMBARD_X_OFFSET = 220; // offset outward from city center past platform edge
const AIM_DURATION = 3.0;
const MORTAR_GRAVITY = 0.18;
const SCORE_BOMBARD_SUB = 350;

export function resetBombardSubs() {
  bombardSubs = [];
  mortars = [];
  bombardSpawnTimer = 45;
}

export function getBombardSubs() {
  return bombardSubs;
}
export function getMortars() {
  return mortars;
}

export function updateBombardSubs(
  dt: number,
  viewH: number,
  playerX: number,
  viewHalfW: number,
  waveDifficulty: number,
  fleeing: boolean,
  gameTime: number,
  /** Position of bomber target city's structure — null if destroyed */
  bomberTargetStructure: { x: number; y: number } | null,
  /** Center X of the bomber target city — used to compute outward spawn direction */
  bomberCityX: number = 0,
): void {
  const waterY = getWaterSurfaceY(viewH);

  // ---- Spawning ----
  if (!fleeing && gameTime > 30 && bomberTargetStructure !== null) {
    bombardSpawnTimer -= dt;
    const interval = Math.max(30 - waveDifficulty * 4, 15);
    if (bombardSpawnTimer <= 0 && bombardSubs.filter((s) => s.alive).length === 0) {
      bombardSpawnTimer = interval + Math.random() * 12;

      // Always offset outward from the city center so sub spawns outside the platform
      const outwardDir = bomberTargetStructure.x >= bomberCityX ? 1 : -1;
      const spawnX = bomberTargetStructure.x + outwardDir * BOMBARD_X_OFFSET;

      bombardSubs.push({
        x: spawnX,
        y: waterY + BOMBARD_SPAWN_DEPTH,
        alive: true,
        phase: "rising",
        phaseTimer: 0,
        targetStructureX: bomberTargetStructure.x,
        targetStructureY: bomberTargetStructure.y,
        surfaceY: waterY,
      });
    }
  }

  // ---- Update ----
  for (const s of bombardSubs) {
    if (!s.alive) continue;

    // Fleeing — just sink immediately
    if (fleeing && s.phase !== "sinking") s.phase = "sinking";

    switch (s.phase) {
      case "rising": {
        s.y -= BOMBARD_RISE_SPEED;
        if (s.y <= s.surfaceY) {
          s.y = s.surfaceY;
          s.phase = "aiming";
          s.phaseTimer = AIM_DURATION;
        }
        break;
      }
      case "aiming": {
        s.y = s.surfaceY;
        s.phaseTimer -= dt;
        if (s.phaseTimer <= 0) s.phase = "firing";
        break;
      }
      case "firing": {
        // Arc mortar to structure position
        const dx = s.targetStructureX - s.x;
        const dy = s.targetStructureY - s.y;
        const flightTime = 55;
        const vx = dx / flightTime;
        const vy = dy / flightTime - 0.5 * MORTAR_GRAVITY * flightTime;
        mortars.push({
          x: s.x,
          y: s.y - 10,
          vx,
          vy,
          alive: true,
          trail: [],
          targetX: s.targetStructureX,
          targetY: s.targetStructureY,
        });
        s.phase = "sinking";
        break;
      }
      case "sinking": {
        s.y += BOMBARD_SINK_SPEED;
        // Despawn once well below screen
        if (s.y > waterY + BOMBARD_SPAWN_DEPTH + 50) s.alive = false;
        break;
      }
    }
  }

  // ---- Update mortars ----
  for (const m of mortars) {
    if (!m.alive) continue;
    m.trail.push({ x: m.x, y: m.y });
    if (m.trail.length > 18) m.trail.shift();
    m.vy += MORTAR_GRAVITY;
    m.x += m.vx;
    m.y += m.vy;
    if (m.y > waterY + 20) m.alive = false;
    if (Math.abs(m.x - playerX) > viewHalfW * 4) m.alive = false;
  }

  bombardSubs = bombardSubs.filter((s) => s.alive);
  mortars = mortars.filter((m) => m.alive);
}

export function checkMortarHitsStructure(
  mortarList: Mortar[],
  structurePos: { x: number; y: number } | null,
  hitRadius: number = 42,
): number {
  if (!structurePos) return 0;
  let hits = 0;
  for (const m of mortarList) {
    if (!m.alive) continue;
    if (Math.hypot(m.x - structurePos.x, m.y - structurePos.y) < hitRadius) {
      m.alive = false;
      spawnExplosion(m.x, m.y, 30);
      hits++;
    }
  }
  return hits;
}

export function checkBulletHitsBombardSub(bullets: { x: number; y: number; dx: number; dy: number; id: number }[]): {
  remaining: typeof bullets;
  score: number;
} {
  const remaining: typeof bullets = [];
  let score = 0;

  for (const b of bullets) {
    let hit = false;

    // Only shootable while surfaced (aiming phase) — it's underwater otherwise
    for (const s of bombardSubs) {
      if (!s.alive) continue;
      if (s.phase !== "aiming" && s.phase !== "firing") continue;
      if (Math.hypot(b.x - s.x, b.y - s.y) < SUB_WIDTH / 2 + 5) {
        s.alive = false;
        spawnExplosion(s.x, s.y, 40, SCORE_BOMBARD_SUB);
        score += SCORE_BOMBARD_SUB;
        hit = true;
        break;
      }
    }

    // Mortars in flight are always shootable
    if (!hit) {
      for (const m of mortars) {
        if (!m.alive) continue;
        if (Math.hypot(b.x - m.x, b.y - m.y) < 10) {
          m.alive = false;
          spawnExplosion(m.x, m.y, 20, 75);
          score += 75;
          hit = true;
          break;
        }
      }
    }

    if (!hit) remaining.push(b);
  }

  return { remaining, score };
}

export function drawBombardSubs(ctx: CanvasRenderingContext2D) {
  const now = performance.now();

  // ---- Mortars ----
  for (const m of mortars) {
    if (!m.alive) continue;

    // Smoke trail
    for (let i = 0; i < m.trail.length; i++) {
      const t = i / m.trail.length;
      const tr = m.trail[i];
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 2 + t * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 120, 60, ${t * 0.4})`;
      ctx.fill();
    }

    // Shell
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(now * 0.01);
    const ms = 6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * ms, Math.sin(a) * ms);
      else ctx.lineTo(Math.cos(a) * ms, Math.sin(a) * ms);
    }
    ctx.closePath();
    ctx.fillStyle = "#2a1a0a";
    ctx.fill();
    ctx.strokeStyle = "#ff6030";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 120, 40, ${0.7 + Math.sin(now * 0.02) * 0.3})`;
    ctx.fill();
    ctx.restore();

    // Landing marker — dashed X at target
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(255, 100, 40, 0.55)";
    ctx.lineWidth = 1.5;
    const xs = 9;
    ctx.beginPath();
    ctx.moveTo(m.targetX - xs, m.targetY - xs);
    ctx.lineTo(m.targetX + xs, m.targetY + xs);
    ctx.moveTo(m.targetX + xs, m.targetY - xs);
    ctx.lineTo(m.targetX - xs, m.targetY + xs);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ---- Bombardment subs ----
  for (const s of bombardSubs) {
    if (!s.alive) continue;

    // Only draw when near or at surface — fade in as it rises
    const distFromSurface = s.y - s.surfaceY;
    const visibility = Math.max(0, Math.min(1, 1 - distFromSurface / 80));
    if (visibility <= 0) continue;

    ctx.save();
    ctx.globalAlpha = visibility;
    ctx.translate(s.x, s.y);

    const hw = SUB_WIDTH / 2 + 4;
    const hh = SUB_HEIGHT / 2;

    // Hull — orange-tinted to distinguish from regular subs
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    const hullGrad = ctx.createLinearGradient(0, -hh, 0, hh);
    hullGrad.addColorStop(0, "#3a2010");
    hullGrad.addColorStop(0.5, "#201008");
    hullGrad.addColorStop(1, "#2a1808");
    ctx.fillStyle = hullGrad;
    ctx.fill();
    ctx.strokeStyle = "#664422";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Danger stripe
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.9, hh * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#6a2000";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.7, hh * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1a0800";
    ctx.fill();

    // Mortar barrel — angled toward target, visible when aiming
    if (s.phase === "aiming" || s.phase === "firing") {
      const barrelAngle = Math.atan2(s.targetStructureY - s.y, s.targetStructureX - s.x) - Math.PI * 0.25;
      ctx.save();
      ctx.translate(0, -hh);
      ctx.rotate(barrelAngle);
      ctx.fillStyle = "#443322";
      ctx.fillRect(-2, -14, 4, 14);
      ctx.strokeStyle = "#886644";
      ctx.lineWidth = 1;
      ctx.strokeRect(-2, -14, 4, 14);
      if (s.phase === "firing") {
        ctx.beginPath();
        ctx.arc(0, -14, 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 160, 60, 0.9)";
        ctx.fill();
      }
      ctx.restore();
    }

    // Conning tower
    ctx.beginPath();
    ctx.moveTo(-6, -hh);
    ctx.lineTo(-4, -hh - 9);
    ctx.lineTo(4, -hh - 9);
    ctx.lineTo(6, -hh);
    ctx.closePath();
    ctx.fillStyle = "#2a1808";
    ctx.fill();
    ctx.strokeStyle = "#884422";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Eye — orange
    const eyeDir = s.targetStructureX > s.x ? 1 : -1;
    const eyeX = eyeDir * hw * 0.35;
    ctx.beginPath();
    ctx.arc(eyeX, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    const eyePulse = 0.6 + Math.sin(now * 0.006) * 0.4;
    ctx.beginPath();
    ctx.arc(eyeX, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 120, 20, ${eyePulse})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX, 0, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Aiming flash ring + countdown arc
    if (s.phase === "aiming") {
      if (Math.sin(now * 0.012) > 0) {
        ctx.beginPath();
        ctx.ellipse(0, 0, hw + 8, hh + 8, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 120, 40, 0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const fraction = s.phaseTimer / AIM_DURATION;
      ctx.beginPath();
      ctx.arc(0, -hh - 14, 8, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 160, 40, 0.9)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Rising water disturbance — ripples while coming up
    if (s.phase === "rising" && distFromSurface < 60) {
      const rippleAlpha = (1 - distFromSurface / 60) * 0.4;
      for (const r of [12, 22, 34]) {
        ctx.beginPath();
        ctx.ellipse(0, -hh, r, r * 0.3, 0, Math.PI, 0);
        ctx.strokeStyle = `rgba(100, 200, 220, ${rippleAlpha * (1 - r / 40)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
