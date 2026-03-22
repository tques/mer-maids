/**
 * pickups.ts — Collectible Pickup System
 *
 * Changes from original:
 * - AMMO_LOW_THRESHOLD raised 12 → 22 (earlier warning, less panic)
 * - Ammo crate is launched toward the player's current X position
 * - Crate lands on the water surface (not hovering above it)
 * - Landed crate bobs on the waves like other floating objects
 * - Crate bounces off city platforms and depot instead of landing on them
 */

import { getWaterSurfaceY, getWaveY } from "./water";

// ==================== CONSTANTS ====================

const POWERUP_LIFETIME = 18000;
const SINK_SPEED = 0.3;
export const AMMO_BOX_SIZE = 22;
export const MAX_AMMO = 60;
export const AMMO_LOW_THRESHOLD = 22;
const AMMO_DROP_LIFETIME = 20000;
const DEPOT_WIDTH = 120;
const DEPOT_HULL_DEPTH = 40;
const CANNON_LAUNCH_VY = -480;
const CANNON_GRAVITY = 200;
const PARACHUTE_SPEED = 35;
const PARACHUTE_TARGET_ABOVE_SURFACE = 0;

// ==================== INTERFACES ====================

export type PowerupType = "health" | "repair";

export interface Powerup {
  x: number;
  y: number;
  targetY: number;
  type: PowerupType;
  spawnTime: number;
  alive: boolean;
  sinking: boolean;
}

type AmmoCratePhase = "launching" | "parachuting" | "landed";

export interface AmmoBox {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: AmmoCratePhase;
  targetY: number;
  spawnTime: number;
  depotIndex: number;
}

interface AmmoDepot {
  x: number;
  cannonFireTime: number;
}

// ==================== MODULE STATE ====================

let powerups: Powerup[] = [];
let nextHealthReward = 1500;
let nextRepairReward = 1200;
let ammoCrate: AmmoBox | null = null;
let ammoCrateAlert = 0;
let ammoDrop: { x: number; y: number; spawnTime: number } | null = null;
let ammoDropTimer = 30 + Math.random() * 30;
let depot: AmmoDepot | null = null;

// ==================== RESET ====================

export function resetPickups(worldWidth?: number) {
  powerups = [];
  nextHealthReward = 1500;
  nextRepairReward = 1200;
  ammoCrate = null;
  ammoCrateAlert = 0;
  ammoDrop = null;
  ammoDropTimer = 30 + Math.random() * 30;
  if (worldWidth) {
    depot = { x: worldWidth - 80, cannonFireTime: 0 };
  }
}

// ==================== ACCESSORS ====================

export function getPowerups() {
  return powerups;
}
export function getAmmoCrate() {
  return ammoCrate;
}
export function getAmmoCrateAlert() {
  return ammoCrateAlert;
}
export function getAmmoDrop() {
  return ammoDrop;
}
export function getDepot() {
  return depot;
}

// ==================== UNDERWATER PICKUP SPAWNING ====================

function hasActiveType(type: PowerupType): boolean {
  return powerups.some((p) => p.alive && p.type === type);
}

export function checkScoreRewards(score: number, boatX: number, boatWidth: number, viewH: number) {
  const surfaceY = getWaterSurfaceY(viewH);
  if (score >= nextHealthReward && !hasActiveType("health")) {
    nextHealthReward = score + 1500;
    const spawnX = boatX + (Math.random() - 0.5) * boatWidth * 0.4;
    powerups.push({
      x: spawnX,
      y: surfaceY - 5,
      targetY: surfaceY + 60 + Math.random() * 40,
      type: "health",
      spawnTime: performance.now(),
      alive: true,
      sinking: true,
    });
  }
  if (score >= nextRepairReward && !hasActiveType("repair")) {
    nextRepairReward = score + 1200;
    const spawnX = boatX + (Math.random() - 0.5) * boatWidth * 0.4;
    powerups.push({
      x: spawnX,
      y: surfaceY - 5,
      targetY: surfaceY + 50 + Math.random() * 50,
      type: "repair",
      spawnTime: performance.now(),
      alive: true,
      sinking: true,
    });
  }
}

// ==================== UNDERWATER PICKUP COLLISION ====================

export function checkPowerupPickup(px: number, py: number, radius: number): PowerupType | null {
  for (const p of powerups) {
    if (!p.alive) continue;
    if (Math.hypot(p.x - px, p.y - py) < radius + 14) {
      p.alive = false;
      return p.type;
    }
  }
  return null;
}

// ==================== AMMO CRATE: DEPOT CANNON LAUNCH ====================

function launchCrateFromDepot(viewH: number, worldWidth: number, playerX: number) {
  if (!depot) return;

  const surfY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(depot.x, surfY);
  const cannonY = waveY - 22 - 18;

  const timeToApex = Math.abs(CANNON_LAUNCH_VY) / CANNON_GRAVITY;
  const apexHeight = (CANNON_LAUNCH_VY * CANNON_LAUNCH_VY) / (2 * CANNON_GRAVITY);
  const parachuteTime = apexHeight / PARACHUTE_SPEED;
  const totalFlightTime = timeToApex + parachuteTime;

  const halfWorld = worldWidth / 2;
  let delta = playerX - depot.x;
  if (delta > halfWorld) delta -= worldWidth;
  if (delta < -halfWorld) delta += worldWidth;

  const vx = delta / totalFlightTime;
  const targetY = surfY - PARACHUTE_TARGET_ABOVE_SURFACE;

  ammoCrate = {
    x: depot.x,
    y: cannonY,
    vx,
    vy: CANNON_LAUNCH_VY,
    phase: "launching",
    targetY,
    spawnTime: performance.now(),
    depotIndex: 0,
  };

  depot.cannonFireTime = performance.now();
  ammoCrateAlert = 3000;
}

// ==================== PLATFORM TYPE ====================

export interface CratePlatform {
  x: number;
  halfW: number;
  topY: number;
  bottomY: number;
}

// ==================== AMMO CRATE UPDATE ====================

export function updateAmmoCrate(
  ammo: number,
  playerX: number,
  playerY: number,
  playerRadius: number,
  worldWidth: number,
  viewH: number,
  frameDelta: number,
  platforms: CratePlatform[] = [],
): number {
  const dt = frameDelta / 1000;

  if (ammo <= AMMO_LOW_THRESHOLD && !ammoCrate) {
    launchCrateFromDepot(viewH, worldWidth, playerX);
  }

  if (ammoCrateAlert > 0) ammoCrateAlert -= frameDelta;

  if (ammoCrate) {
    const surfY = getWaterSurfaceY(viewH);

    if (ammoCrate.phase === "launching") {
      ammoCrate.vy += CANNON_GRAVITY * dt;
      ammoCrate.x += ammoCrate.vx * dt;
      ammoCrate.y += ammoCrate.vy * dt;

      if (ammoCrate.vy > 0) {
        ammoCrate.phase = "parachuting";
        ammoCrate.vy = PARACHUTE_SPEED;
      }
    } else if (ammoCrate.phase === "parachuting") {
      ammoCrate.y += ammoCrate.vy * dt;
      ammoCrate.x += ammoCrate.vx * dt;

      // Check platform collisions — bounce off the top surface
      const halfBox = AMMO_BOX_SIZE / 2;
      let bounced = false;
      for (const p of platforms) {
        if (ammoCrate.x > p.x - p.halfW && ammoCrate.x < p.x + p.halfW) {
          if (ammoCrate.y + halfBox >= p.topY && ammoCrate.y < p.topY + 20) {
            // Landed on platform top — bounce outward toward water
            ammoCrate.y = p.topY - halfBox;
            ammoCrate.vy = -80; // bounce up a little
            // Push horizontally away from platform center
            const bounceDir = ammoCrate.x < p.x ? -1 : 1;
            ammoCrate.vx = bounceDir * 60;
            bounced = true;
            break;
          }
        }
      }

      if (!bounced) {
        // Land on water surface
        const waveAtCrate = getWaveY(ammoCrate.x, surfY, worldWidth);
        if (ammoCrate.y + halfBox >= waveAtCrate) {
          ammoCrate.y = waveAtCrate - halfBox;
          ammoCrate.phase = "landed";
          ammoCrate.vx = 0;
          ammoCrate.vy = 0;
        }
      }
    } else {
      // Landed: follow wave surface so it bobs naturally
      const waveAtCrate = getWaveY(ammoCrate.x, surfY, worldWidth);
      ammoCrate.y = waveAtCrate - AMMO_BOX_SIZE / 2;
    }

    // Wrap X
    ammoCrate.x = ((ammoCrate.x % worldWidth) + worldWidth) % worldWidth;

    // Collision with player
    let ddx = Math.abs(playerX - ammoCrate.x);
    if (ddx > worldWidth / 2) ddx = worldWidth - ddx;
    const ddy = Math.abs(playerY - ammoCrate.y);
    if (ddx < playerRadius + AMMO_BOX_SIZE && ddy < playerRadius + AMMO_BOX_SIZE) {
      ammoCrate = null;
      ammoCrateAlert = 0;
      return MAX_AMMO;
    }
  }

  return ammo;
}

// ==================== RARE AMMO DROP ====================

export function updateAmmoDrop(
  ammo: number,
  playerX: number,
  playerY: number,
  playerRadius: number,
  worldWidth: number,
  viewH: number,
  dt: number,
): number {
  ammoDropTimer -= dt;
  if (ammoDropTimer <= 0 && !ammoDrop) {
    ammoDropTimer = 40 + Math.random() * 40;
    const surfY = getWaterSurfaceY(viewH);
    const dropX = 200 + Math.random() * (worldWidth - 400);
    const dropY = 30 + Math.random() * (surfY - 60);
    ammoDrop = { x: dropX, y: dropY, spawnTime: performance.now() };
  }

  if (ammoDrop) {
    if (performance.now() - ammoDrop.spawnTime > AMMO_DROP_LIFETIME) {
      ammoDrop = null;
    } else {
      let ddx = Math.abs(playerX - ammoDrop.x);
      if (ddx > worldWidth / 2) ddx = worldWidth - ddx;
      const ddy = Math.abs(playerY - ammoDrop.y);
      if (ddx < playerRadius + AMMO_BOX_SIZE && ddy < playerRadius + AMMO_BOX_SIZE) {
        ammoDrop = null;
        return Math.min(ammo + 20, MAX_AMMO);
      }
    }
  }

  return ammo;
}

// ==================== UPDATE POWERUPS ====================

export function updatePowerups() {
  const now = performance.now();
  for (const p of powerups) {
    if (!p.alive) continue;
    if (p.sinking) {
      p.y += SINK_SPEED;
      if (p.y >= p.targetY) {
        p.y = p.targetY;
        p.sinking = false;
      }
    }
    if (!p.sinking && now - p.spawnTime > POWERUP_LIFETIME) {
      p.alive = false;
    }
  }
  powerups = powerups.filter((p) => p.alive);
}

// ==================== RENDERING: AMMO DEPOT ====================

export function drawAmmoDepots(ctx: CanvasRenderingContext2D, viewH: number) {
  if (!depot) return;
  const now = performance.now();
  const surfaceY = getWaterSurfaceY(viewH);

  const waveY = getWaveY(depot.x, surfaceY);
  const topY = waveY - 22;
  const hw = DEPOT_WIDTH / 2;
  const hd = DEPOT_HULL_DEPTH;

  ctx.save();

  // Platform hull
  const baseR = 8;
  ctx.beginPath();
  ctx.moveTo(depot.x - hw + baseR, topY + hd);
  ctx.lineTo(depot.x + hw - baseR, topY + hd);
  ctx.quadraticCurveTo(depot.x + hw, topY + hd, depot.x + hw, topY + hd - baseR);
  ctx.lineTo(depot.x + hw, topY + 3);
  ctx.quadraticCurveTo(depot.x + hw, topY, depot.x + hw - baseR, topY);
  ctx.lineTo(depot.x - hw + baseR, topY);
  ctx.quadraticCurveTo(depot.x - hw, topY, depot.x - hw, topY + 3);
  ctx.lineTo(depot.x - hw, topY + hd - baseR);
  ctx.quadraticCurveTo(depot.x - hw, topY + hd, depot.x - hw + baseR, topY + hd);
  ctx.closePath();
  ctx.fillStyle = "rgba(20, 60, 80, 0.9)";
  ctx.fill();

  // Platform surface highlight
  ctx.beginPath();
  ctx.moveTo(depot.x - hw + baseR, topY);
  ctx.lineTo(depot.x + hw - baseR, topY);
  ctx.quadraticCurveTo(depot.x + hw, topY, depot.x + hw - 3, topY + 3);
  ctx.lineTo(depot.x - hw + 3, topY + 3);
  ctx.quadraticCurveTo(depot.x - hw, topY, depot.x - hw + baseR, topY);
  ctx.closePath();
  ctx.fillStyle = "rgba(100, 220, 210, 0.2)";
  ctx.fill();

  // Hull lines
  ctx.strokeStyle = "rgba(80, 200, 190, 0.12)";
  ctx.lineWidth = 0.5;
  for (let i = 1; i <= 2; i++) {
    const ly = topY + (hd * i) / 3;
    ctx.beginPath();
    ctx.moveTo(depot.x - hw + 6, ly);
    ctx.lineTo(depot.x + hw - 6, ly);
    ctx.stroke();
  }

  // Warehouse buildings
  const warehouses = [
    { ox: -35, w: 22, h: 16 },
    { ox: 30, w: 26, h: 14 },
  ];
  for (const wh of warehouses) {
    const wx = depot.x + wh.ox;
    const wy = topY - wh.h;
    const whGrad = ctx.createLinearGradient(wx - wh.w / 2, wy, wx + wh.w / 2, wy + wh.h);
    whGrad.addColorStop(0, "rgba(30, 70, 90, 0.8)");
    whGrad.addColorStop(1, "rgba(15, 40, 60, 0.9)");
    ctx.fillStyle = whGrad;
    ctx.fillRect(wx - wh.w / 2, wy, wh.w, wh.h);
    ctx.strokeStyle = "rgba(80, 200, 190, 0.1)";
    ctx.lineWidth = 0.5;
    for (let rx = wx - wh.w / 2 + 4; rx < wx + wh.w / 2; rx += 4) {
      ctx.beginPath();
      ctx.moveTo(rx, wy);
      ctx.lineTo(rx, topY);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(120, 230, 220, 0.12)";
    ctx.fillRect(wx - wh.w / 2 - 1, wy, wh.w + 2, 2);
    ctx.fillStyle = "rgba(10, 30, 45, 0.9)";
    ctx.fillRect(wx - 3, topY - 8, 6, 8);
    ctx.strokeStyle = "rgba(80, 200, 190, 0.2)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(wx - 3, topY - 8, 6, 8);
  }

  // Stacked crates
  const cratePositions = [
    { ox: -10, oy: 0, sz: 8 },
    { ox: -2, oy: 0, sz: 7 },
    { ox: 6, oy: 0, sz: 8 },
    { ox: -6, oy: -8, sz: 7 },
    { ox: 2, oy: -8, sz: 7 },
    { ox: -2, oy: -15, sz: 6 },
  ];
  for (const cr of cratePositions) {
    const cx = depot.x + cr.ox;
    const cy = topY + cr.oy - cr.sz;
    ctx.fillStyle = "#8a7030";
    ctx.fillRect(cx - cr.sz / 2, cy, cr.sz, cr.sz);
    ctx.strokeStyle = "#604800";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - cr.sz / 2, cy);
    ctx.lineTo(cx + cr.sz / 2, cy + cr.sz);
    ctx.moveTo(cx + cr.sz / 2, cy);
    ctx.lineTo(cx - cr.sz / 2, cy + cr.sz);
    ctx.stroke();
    ctx.strokeStyle = "#6a5820";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(cx - cr.sz / 2, cy, cr.sz, cr.sz);
  }

  // Cannon
  const cannonAge = now - depot.cannonFireTime;
  const recoil = cannonAge < 300 ? Math.max(0, 1 - cannonAge / 300) * 6 : 0;
  const cannonBaseX = depot.x + 18;
  const cannonBaseY = topY;
  ctx.fillStyle = "#3a4050";
  ctx.beginPath();
  ctx.arc(cannonBaseX - 4, cannonBaseY - 3, 5, 0, Math.PI * 2);
  ctx.arc(cannonBaseX + 4, cannonBaseY - 3, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a3040";
  ctx.beginPath();
  ctx.arc(cannonBaseX - 4, cannonBaseY - 3, 2, 0, Math.PI * 2);
  ctx.arc(cannonBaseX + 4, cannonBaseY - 3, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cannonBaseX, cannonBaseY - 6);
  ctx.rotate(-0.15);
  ctx.fillStyle = "#555d70";
  ctx.fillRect(-3.5, -18 + recoil, 7, 18);
  ctx.fillStyle = "#1a1f2e";
  ctx.fillRect(-2.5, -18 + recoil, 5, 2);
  ctx.fillStyle = "#6a7080";
  ctx.fillRect(-4.5, -19 + recoil, 9, 3);
  ctx.restore();

  // Cannon smoke
  if (cannonAge < 800) {
    const smokeAlpha = Math.max(0, 1 - cannonAge / 800) * 0.5;
    ctx.globalAlpha = smokeAlpha;
    for (let i = 0; i < 5; i++) {
      const sx = cannonBaseX + Math.sin(cannonAge / 100 + i * 1.5) * (8 + cannonAge / 50);
      const sy = cannonBaseY - 24 - cannonAge / 25 - i * 6;
      const sr = 3 + cannonAge / 150 + i * 2;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = "#aab0c0";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // "AMMO" label
  ctx.fillStyle = "#8090a0";
  ctx.font = "bold 6px monospace";
  ctx.textAlign = "center";
  ctx.fillText("AMMO", depot.x, topY + hd - 4);

  // Waterline highlight
  ctx.beginPath();
  ctx.moveTo(depot.x - hw + 5, topY + hd);
  ctx.lineTo(depot.x + hw - 5, topY + hd);
  ctx.strokeStyle = "rgba(100, 160, 200, 0.15)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

// ==================== RENDERING: PICKUPS ====================

export function drawPickups(ctx: CanvasRenderingContext2D) {
  const now = performance.now();

  // Underwater pickups (health/repair)
  for (const p of powerups) {
    if (!p.alive) continue;
    const age = now - p.spawnTime;
    const timeLeft = POWERUP_LIFETIME - age;
    if (!p.sinking && timeLeft < 4000) {
      const blinkRate = timeLeft < 2000 ? 100 : 250;
      if (Math.floor(now / blinkRate) % 2 === 0) continue;
    }
    const bob = p.sinking ? 0 : Math.sin(age / 500) * 4;
    const py = p.y + bob;
    const sinkAlpha = p.sinking ? Math.min((p.y - (p.targetY - 80)) / 40, 1) : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0.2, sinkAlpha);
    ctx.translate(p.x, py);
    ctx.shadowColor = p.type === "health" ? "rgba(217, 54, 54, 0.7)" : "rgba(90, 170, 153, 0.7)";
    ctx.shadowBlur = 18;
    if (p.type === "health") {
      ctx.fillStyle = "#D93636";
      ctx.fillRect(-8, -3, 16, 6);
      ctx.fillRect(-3, -8, 6, 16);
      ctx.strokeStyle = "#ff8888";
      ctx.lineWidth = 1;
      ctx.strokeRect(-8, -3, 16, 6);
      ctx.strokeRect(-3, -8, 6, 16);
    } else {
      ctx.fillStyle = "#5a9";
      ctx.fillRect(-8, -3, 16, 6);
      ctx.fillRect(-3, -8, 6, 16);
      ctx.strokeStyle = "#8fd4b8";
      ctx.lineWidth = 1;
      ctx.strokeRect(-8, -3, 16, 6);
      ctx.strokeRect(-3, -8, 6, 16);
    }
    if (p.sinking) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      for (let i = 0; i < 3; i++) {
        const bx = Math.sin(age / 300 + i * 2) * 6;
        const by = -12 - i * 8 - ((age / 80) % 20);
        ctx.beginPath();
        ctx.arc(bx, by, 1.5 + i * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 220, 255, ${0.4 - i * 0.1})`;
        ctx.fill();
      }
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.type === "health" ? "HP" : "Barrier", 0, -14);
    ctx.restore();
  }

  // Emergency ammo crate
  if (ammoCrate) {
    const age = now - ammoCrate.spawnTime;
    const s = AMMO_BOX_SIZE;
    ctx.save();

    if (ammoCrate.phase === "launching") {
      ctx.translate(ammoCrate.x, ammoCrate.y);
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 3; i++) {
        const trailY = 10 + i * 8 + Math.sin(age / 50 + i) * 3;
        const trailR = 3 + i * 1.5;
        ctx.beginPath();
        ctx.arc(Math.sin(age / 80 + i * 2) * 4, trailY, trailR, 0, Math.PI * 2);
        ctx.fillStyle = "#889098";
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawAmmoCrateBox(ctx, s);
    } else if (ammoCrate.phase === "parachuting") {
      const swayX = Math.sin(age / 600) * 8;
      ctx.translate(ammoCrate.x + swayX, ammoCrate.y);
      const chuteW = 32;
      const chuteH = 20;
      const chuteY = -s / 2 - 8 - chuteH;
      ctx.beginPath();
      ctx.moveTo(-chuteW, chuteY + chuteH);
      ctx.quadraticCurveTo(-chuteW * 0.5, chuteY - 4, 0, chuteY);
      ctx.quadraticCurveTo(chuteW * 0.5, chuteY - 4, chuteW, chuteY + chuteH);
      ctx.closePath();
      ctx.fillStyle = "#8a7a50";
      ctx.fill();
      ctx.strokeStyle = "#6a5a30";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = "#706040";
      ctx.lineWidth = 0.5;
      for (let i = -2; i <= 2; i++) {
        const px = i * (chuteW / 3);
        ctx.beginPath();
        ctx.moveTo(px, chuteY + 2);
        ctx.lineTo(px * 0.6, chuteY + chuteH);
        ctx.stroke();
      }
      ctx.strokeStyle = "#a09070";
      ctx.lineWidth = 0.7;
      for (const sx of [-chuteW + 4, -chuteW / 2, 0, chuteW / 2, chuteW - 4]) {
        ctx.beginPath();
        ctx.moveTo(sx, chuteY + chuteH);
        ctx.lineTo(sx > 0 ? s / 2 - 2 : -s / 2 + 2, -s / 2 - 2);
        ctx.stroke();
      }
      drawAmmoCrateBox(ctx, s);
    } else {
      // Landed: already following wave in update, draw with gentle roll
      const bobAngle = Math.sin(age / 800) * 0.08;
      ctx.translate(ammoCrate.x, ammoCrate.y);
      ctx.rotate(bobAngle);
      drawAmmoCrateBox(ctx, s);
    }

    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    const labelY = ammoCrate.phase === "parachuting" ? -s / 2 - 36 : -s / 2 - 6;
    ctx.fillText("Ammo", 0, labelY);
    ctx.restore();
  }

  // Rare ammo drop
  if (ammoDrop) {
    const t = (now - ammoDrop.spawnTime) / 500;
    const bobY = ammoDrop.y + Math.sin(t) * 5;
    const s = AMMO_BOX_SIZE * 0.85;
    const fadeAge = (now - ammoDrop.spawnTime) / AMMO_DROP_LIFETIME;
    const blinkAlpha = fadeAge > 0.7 ? (Math.sin(now / 150) > 0 ? 1 : 0.3) : 1;
    ctx.save();
    ctx.globalAlpha = blinkAlpha;
    ctx.translate(ammoDrop.x, bobY);
    ctx.fillStyle = "#2a6080";
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.fillStyle = "#40a0d0";
    ctx.fillRect(-s / 2, -s / 2, s, s * 0.3);
    ctx.strokeStyle = "#1a4060";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 7px monospace";
    ctx.textAlign = "center";
    ctx.fillText("+20", 0, 3);
    ctx.restore();
  }
}

// ==================== AMMO CRATE BOX HELPER ====================

function drawAmmoCrateBox(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = "#c8a020";
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.fillStyle = "#f0c830";
  ctx.fillRect(-s / 2, -s / 2, s, s * 0.35);
  ctx.fillStyle = "#805a00";
  const bw = 3,
    bh = 10;
  ctx.fillRect(-bw * 2, -bh / 2 + 2, bw, bh);
  ctx.fillRect(-bw / 2, -bh / 2 + 2, bw, bh);
  ctx.fillRect(bw, -bh / 2 + 2, bw, bh);
  ctx.fillStyle = "#d4a017";
  ctx.beginPath();
  ctx.arc(-bw * 2 + bw / 2, -bh / 2 + 2, bw / 2 + 0.5, Math.PI, 0);
  ctx.arc(-bw / 2 + bw / 2, -bh / 2 + 2, bw / 2 + 0.5, Math.PI, 0);
  ctx.arc(bw + bw / 2, -bh / 2 + 2, bw / 2 + 0.5, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = "#604800";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-s / 2, -s / 2, s, s);
}

// ==================== HUD ALERT ====================

export function drawAmmoCrateAlert(ctx: CanvasRenderingContext2D, hudX: number, hudY: number) {
  if (ammoCrate && ammoCrateAlert > 0) {
    const flash = Math.sin(performance.now() / 200) > 0;
    if (flash) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 10px monospace";
      ctx.fillStyle = "#f0c830";
      ctx.fillText("▼ AMMO CRATE LAUNCHED ▼", hudX, hudY);
      ctx.restore();
    }
  }
}

// ==================== DEPOT COLLISION ====================

export function collideWithDepot(
  px: number,
  py: number,
  radius: number,
  viewH: number,
): { x: number; y: number; damaging: boolean } | null {
  if (!depot) return null;
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(depot.x, surfaceY);
  const topY = waveY - 22;
  const hw = DEPOT_WIDTH / 2;
  const hd = 36;

  if (px < depot.x - hw - radius || px > depot.x + hw + radius) return null;
  if (py < topY - radius - 40) return null;
  if (py > topY + hd + radius) return null;

  const inX = px > depot.x - hw + 5 && px < depot.x + hw - 5;
  if (inX && py > topY - radius && py < topY + 5) {
    return { x: px, y: topY - radius - 1, damaging: true };
  }
  if (inX && py > topY + 5 && py < topY + hd + radius) {
    return { x: px, y: topY + hd + radius + 1, damaging: false };
  }
  return null;
}
