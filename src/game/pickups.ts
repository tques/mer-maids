/**
 * pickups.ts — Collectible Pickup System
 *
 * All collectible items the player can pick up during gameplay:
 *
 * 1. **Health Kit** (red cross, labeled "HP")
 *    - Restores 1 player HP
 *    - Spawns every 1500 points scored
 *    - Drops from city waterline, sinks to target depth
 *
 * 2. **Barrier Repair** (green cross, labeled "Barrier")
 *    - Restores 3 city/barrier HP
 *    - Spawns every 1200 points scored
 *    - Drops from city waterline, sinks to target depth
 *
 * 3. **Ammo Crate** (gold box, launched from depot cannon)
 *    - Fully restores ammo to max (60)
 *    - Spawns at world-edge ammo depots when ammo drops below threshold (12)
 *    - Launched from cannon, deploys parachute at apex, descends slowly
 *    - Only one can exist at a time
 *    - Persists until collected (no despawn timer)
 *
 * 4. **Rare Ammo Drop** (blue box, labeled "+20")
 *    - Restores 20 ammo (capped at max)
 *    - Spawns periodically every 40–80 seconds
 *    - Despawns after 20 seconds if not collected
 *    - Blinks when about to despawn
 *
 * 5. **Ammo Depot** (single platform at right world edge)
 *    - Static platform at x=worldWidth-80
 *    - Warehouse buildings, stacked crates, cannon on platform (NO barrier)
 *    - Cannon launches ammo crates with high ballistic arc
 *    - Cannon animates (recoil + smoke) when firing
 *
 * Rules:
 * - Only ONE of each underwater type (health/repair) can exist at a time
 * - Only ONE ammo crate and ONE rare drop can exist at a time
 * - Underwater pickups bob gently and blink before despawning (18s)
 * - Ammo crates launch from depot cannon, parachute down, then bob gently
 */

import { getWaterSurfaceY, getWaveY } from "./water";

// ==================== CONSTANTS ====================

/** How long underwater pickups exist before despawning (ms) */
const POWERUP_LIFETIME = 18000; // 18 seconds

/** How fast underwater pickups sink toward target depth (px/frame) */
const SINK_SPEED = 0.3;

/** Ammo box visual size (width/height of the crate) */
export const AMMO_BOX_SIZE = 22;

/** Maximum ammo the player can carry */
export const MAX_AMMO = 60;

/** Ammo threshold that triggers emergency crate spawn */
export const AMMO_LOW_THRESHOLD = 12;

/** How long rare ammo drops exist before despawning (ms) */
const AMMO_DROP_LIFETIME = 20000; // 20 seconds

// --- Ammo depot constants ---

/** Width of each ammo depot platform */
const DEPOT_WIDTH = 120;

/** Depth of the depot hull below surface */
const DEPOT_HULL_DEPTH = 20;

/** Cannon launch upward velocity (px per second) */
const CANNON_LAUNCH_VY = -520;

/** Gravity applied during launch phase (px/s²) */
const CANNON_GRAVITY = 200;

/** Parachute descent speed (px per second) */
const PARACHUTE_SPEED = 35;

/** Target Y for parachute landing (relative to surface) */
const PARACHUTE_TARGET_ABOVE_SURFACE = 50;

// ==================== INTERFACES ====================

/** The two underwater power-up types */
export type PowerupType = "health" | "repair";

/**
 * An underwater collectible (health kit or barrier repair).
 * Spawns at the city waterline and sinks to a target depth.
 */
export interface Powerup {
  x: number;          // World X position
  y: number;          // Current Y position (changes while sinking)
  targetY: number;    // Final resting depth (stops sinking here)
  type: PowerupType;  // "health" or "repair"
  spawnTime: number;  // performance.now() timestamp of spawn
  alive: boolean;     // false = collected or despawned
  sinking: boolean;   // true while still falling to target depth
}

/** Ammo crate flight phase */
type AmmoCratePhase = "launching" | "parachuting" | "landed";

/**
 * An ammo crate launched from a depot cannon.
 * Goes through phases: launching (ballistic arc) → parachuting (slow descent) → landed (bobbing).
 */
export interface AmmoBox {
  x: number;           // World X position
  y: number;           // World Y position (updated each frame)
  vx: number;          // Horizontal velocity (px/s)
  vy: number;          // Vertical velocity (px/s, negative = upward)
  phase: AmmoCratePhase;
  targetY: number;     // Final resting Y when parachuting
  spawnTime: number;   // performance.now() timestamp of spawn
  depotIndex: number;  // Which depot (0 or 1) launched this crate
}

/**
 * An ammo depot platform at a world edge.
 * Small city-like structure with a cannon.
 */
interface AmmoDepot {
  x: number;           // World X center
  cannonFireTime: number; // When the cannon last fired (for recoil animation)
}

// ==================== MODULE STATE ====================

// --- Underwater pickups (health/repair) ---
let powerups: Powerup[] = [];
let nextHealthReward = 1500;   // Score threshold for next health kit
let nextRepairReward = 1200;   // Score threshold for next repair kit

// --- Ammo crate (emergency, launched from depot cannon) ---
let ammoCrate: AmmoBox | null = null;
let ammoCrateAlert = 0;        // HUD flash timer (ms remaining)

// --- Rare ammo drop (periodic bonus) ---
let ammoDrop: { x: number; y: number; spawnTime: number } | null = null;
let ammoDropTimer = 30 + Math.random() * 30; // Countdown to first drop (seconds)

// --- Ammo depot (single platform at world edge) ---
let depot: AmmoDepot | null = null;

// ==================== RESET ====================

/**
 * Reset all pickup state. Called at game start and between waves.
 * Also initializes depot positions based on world width.
 */
export function resetPickups(worldWidth?: number) {
  powerups = [];
  nextHealthReward = 1500;
  nextRepairReward = 1200;
  ammoCrate = null;
  ammoCrateAlert = 0;
  ammoDrop = null;
  ammoDropTimer = 30 + Math.random() * 30;

  // Single depot at right world edge
  if (worldWidth) {
    depot = { x: worldWidth - 80, cannonFireTime: 0 };
  }
}

// ==================== ACCESSORS ====================

/** Get active underwater pickups (health/repair) */
export function getPowerups() { return powerups; }

/** Get the current emergency ammo crate (or null) */
export function getAmmoCrate() { return ammoCrate; }

/** Get the ammo crate alert timer (ms remaining, for HUD flash) */
export function getAmmoCrateAlert() { return ammoCrateAlert; }

/** Get the current rare ammo drop (or null) */
export function getAmmoDrop() { return ammoDrop; }

/** Get the ammo depot platform (or null) */
export function getDepot() { return depot; }

// ==================== UNDERWATER PICKUP SPAWNING ====================

/**
 * Check if a power-up of the given type already exists.
 * Enforces the "max 1 of each type" rule.
 */
function hasActiveType(type: PowerupType): boolean {
  return powerups.some(p => p.alive && p.type === type);
}

/**
 * Check if the player's score has reached a reward threshold.
 * If so, spawn a new underwater pickup at the city's waterline.
 *
 * @param score - Current player score
 * @param boatX - City center X position
 * @param boatWidth - City platform width
 * @param viewH - Logical view height
 */
export function checkScoreRewards(score: number, boatX: number, boatWidth: number, viewH: number) {
  const surfaceY = getWaterSurfaceY(viewH);

  // Health kit: spawns every 1500 points (if none active)
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

  // Repair kit: spawns every 1200 points (if none active)
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

/**
 * Check if the player is close enough to pick up an underwater item.
 *
 * @param px - Player X position
 * @param py - Player Y position
 * @param radius - Player collision radius
 * @returns The type collected, or null
 */
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

/**
 * Launch a crate from the single depot cannon.
 */
function launchCrateFromDepot(viewH: number, worldWidth: number) {
  if (!depot) return;

  const surfY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(depot.x, surfY);
  const cannonY = waveY - 10 - 18; // Cannon sits on platform

  // Launch toward center of world
  const launchDir = depot.x < worldWidth / 2 ? 1 : -1;
  const targetY = surfY - PARACHUTE_TARGET_ABOVE_SURFACE;

  ammoCrate = {
    x: depot.x,
    y: cannonY,
    vx: launchDir * (60 + Math.random() * 40),
    vy: CANNON_LAUNCH_VY,
    phase: "launching",
    targetY,
    spawnTime: performance.now(),
    depotIndex: 0,
  };

  depot.cannonFireTime = performance.now();
  ammoCrateAlert = 3000;
}

/**
 * Update the emergency ammo crate system:
 * - Spawn (launch from depot) when ammo is low
 * - Update physics based on current phase
 * - Check player collision
 *
 * @returns New ammo count (MAX_AMMO if collected, unchanged otherwise)
 */
export function updateAmmoCrate(
  ammo: number,
  playerX: number,
  playerY: number,
  playerRadius: number,
  worldWidth: number,
  viewH: number,
  frameDelta: number,
): number {
  const dt = frameDelta / 1000; // Convert ms to seconds

  // ---- Spawn: launch from depot when ammo is low ----
  if (ammo <= AMMO_LOW_THRESHOLD && !ammoCrate) {
    launchCrateFromDepot(viewH, worldWidth);
  }

  // ---- Tick down HUD alert timer ----
  if (ammoCrateAlert > 0) {
    ammoCrateAlert -= frameDelta;
  }

  // ---- Update crate physics ----
  if (ammoCrate) {
    if (ammoCrate.phase === "launching") {
      // Ballistic arc: gravity pulls it down, moves horizontally
      ammoCrate.vy += CANNON_GRAVITY * dt;
      ammoCrate.x += ammoCrate.vx * dt;
      ammoCrate.y += ammoCrate.vy * dt;

      // Transition to parachute when velocity becomes downward (apex reached)
      if (ammoCrate.vy > 0) {
        ammoCrate.phase = "parachuting";
        ammoCrate.vy = PARACHUTE_SPEED; // Slow descent
        ammoCrate.vx *= 0.3; // Reduce horizontal drift under chute
      }
    } else if (ammoCrate.phase === "parachuting") {
      // Gentle descent under parachute
      ammoCrate.y += ammoCrate.vy * dt;
      ammoCrate.x += ammoCrate.vx * dt;
      ammoCrate.vx *= 0.98; // Gradually stop drifting

      // Land when reaching target Y
      if (ammoCrate.y >= ammoCrate.targetY) {
        ammoCrate.y = ammoCrate.targetY;
        ammoCrate.phase = "landed";
        ammoCrate.vx = 0;
        ammoCrate.vy = 0;
      }
    }
    // "landed" phase: crate bobs gently (handled in draw)

    // Wrap X position
    ammoCrate.x = ((ammoCrate.x % worldWidth) + worldWidth) % worldWidth;

    // ---- Check player collision (all phases are collectible) ----
    let ddx = Math.abs(playerX - ammoCrate.x);
    if (ddx > worldWidth / 2) ddx = worldWidth - ddx;
    const ddy = Math.abs(playerY - ammoCrate.y);
    if (ddx < playerRadius + AMMO_BOX_SIZE && ddy < playerRadius + AMMO_BOX_SIZE) {
      ammoCrate = null;
      ammoCrateAlert = 0;
      return MAX_AMMO; // Full refill
    }
  }

  return ammo; // No change
}

// ==================== RARE AMMO DROP SPAWNING & COLLISION ====================

/**
 * Update the rare periodic ammo drop system.
 * Spawns a bonus ammo box every 40–80 seconds, despawns after 20s.
 *
 * @param ammo - Current player ammo count
 * @param playerX - Player X position
 * @param playerY - Player Y position
 * @param playerRadius - Player collision radius
 * @param worldWidth - Total world width
 * @param viewH - Logical view height
 * @param dt - Delta time in seconds
 * @returns New ammo count (+20 if collected, unchanged otherwise)
 */
export function updateAmmoDrop(
  ammo: number,
  playerX: number,
  playerY: number,
  playerRadius: number,
  worldWidth: number,
  viewH: number,
  dt: number,
): number {
  // Countdown to next spawn
  ammoDropTimer -= dt;
  if (ammoDropTimer <= 0 && !ammoDrop) {
    ammoDropTimer = 40 + Math.random() * 40; // 40–80 seconds
    const surfY = getWaterSurfaceY(viewH);
    const dropX = 200 + Math.random() * (worldWidth - 400);
    const dropY = 30 + Math.random() * (surfY - 60);
    ammoDrop = { x: dropX, y: dropY, spawnTime: performance.now() };
  }

  if (ammoDrop) {
    // Despawn after 20 seconds
    if (performance.now() - ammoDrop.spawnTime > AMMO_DROP_LIFETIME) {
      ammoDrop = null;
    } else {
      // Check player collision
      let ddx = Math.abs(playerX - ammoDrop.x);
      if (ddx > worldWidth / 2) ddx = worldWidth - ddx;
      const ddy = Math.abs(playerY - ammoDrop.y);
      if (ddx < playerRadius + AMMO_BOX_SIZE && ddy < playerRadius + AMMO_BOX_SIZE) {
        ammoDrop = null;
        return Math.min(ammo + 20, MAX_AMMO);
      }
    }
  }

  return ammo; // No change
}

// ==================== UPDATE ====================

/**
 * Update underwater pickups: sink toward target depth, check lifetime.
 * Called once per frame from the main game loop.
 */
export function updatePowerups() {
  const now = performance.now();
  for (const p of powerups) {
    if (!p.alive) continue;

    // Sink slowly toward target depth
    if (p.sinking) {
      p.y += SINK_SPEED;
      if (p.y >= p.targetY) {
        p.y = p.targetY;
        p.sinking = false;
      }
    }

    // Despawn after lifetime (only once settled)
    if (!p.sinking && now - p.spawnTime > POWERUP_LIFETIME) {
      p.alive = false;
    }
  }
  powerups = powerups.filter(p => p.alive);
}

// ==================== RENDERING: AMMO DEPOT ====================

/**
 * Draw the single ammo depot platform.
 * Features: hull, warehouse buildings, stacked crates, cannon on platform.
 */
export function drawAmmoDepots(ctx: CanvasRenderingContext2D, viewH: number) {
  if (!depot) return;
  const now = performance.now();
  const surfaceY = getWaterSurfaceY(viewH);

  const waveY = getWaveY(depot.x, surfaceY);
  const topY = waveY - 10; // Platform sits above wave
  const hw = DEPOT_WIDTH / 2;
  const hd = DEPOT_HULL_DEPTH;

  ctx.save();

  // ---- Underwater shadow ----
  ctx.beginPath();
  ctx.ellipse(depot.x, topY + hd + 5, hw * 0.6, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10, 20, 40, 0.25)";
  ctx.fill();

  // ---- Platform hull ----
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
  ctx.fillStyle = "#1a1f2e";
  ctx.fill();

  // ---- Platform surface ----
  ctx.beginPath();
  ctx.moveTo(depot.x - hw + baseR, topY);
  ctx.lineTo(depot.x + hw - baseR, topY);
  ctx.quadraticCurveTo(depot.x + hw, topY, depot.x + hw - 3, topY + 3);
  ctx.lineTo(depot.x - hw + 3, topY + 3);
  ctx.quadraticCurveTo(depot.x - hw, topY, depot.x - hw + baseR, topY);
  ctx.closePath();
  ctx.fillStyle = "#252b3a";
  ctx.fill();

  // ---- Hull lines ----
  ctx.strokeStyle = "#3a4560";
  ctx.lineWidth = 0.5;
  for (let i = 1; i <= 2; i++) {
    const ly = topY + (hd * i) / 3;
    ctx.beginPath();
    ctx.moveTo(depot.x - hw + 6, ly);
    ctx.lineTo(depot.x + hw - 6, ly);
    ctx.stroke();
  }

  // ---- Warehouse buildings (flat-roofed, corrugated look) ----
  const warehouses = [
    { ox: -35, w: 22, h: 16 },
    { ox: 30, w: 26, h: 14 },
  ];
  for (const wh of warehouses) {
    const wx = depot.x + wh.ox;
    const wy = topY - wh.h;

    // Corrugated wall
    ctx.fillStyle = "#2a3040";
    ctx.fillRect(wx - wh.w / 2, wy, wh.w, wh.h);

    // Vertical ridges (corrugation)
    ctx.strokeStyle = "#3a4560";
    ctx.lineWidth = 0.5;
    for (let rx = wx - wh.w / 2 + 4; rx < wx + wh.w / 2; rx += 4) {
      ctx.beginPath();
      ctx.moveTo(rx, wy);
      ctx.lineTo(rx, topY);
      ctx.stroke();
    }

    // Flat roof cap
    ctx.fillStyle = "#3a4560";
    ctx.fillRect(wx - wh.w / 2 - 1, wy, wh.w + 2, 3);

    // Small door
    ctx.fillStyle = "#1a2030";
    ctx.fillRect(wx - 3, topY - 8, 6, 8);
    ctx.strokeStyle = "#4a5570";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(wx - 3, topY - 8, 6, 8);
  }

  // ---- Stacked crates on the platform ----
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
    // Crate body
    ctx.fillStyle = "#8a7030";
    ctx.fillRect(cx - cr.sz / 2, cy, cr.sz, cr.sz);
    // Cross straps
    ctx.strokeStyle = "#604800";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - cr.sz / 2, cy);
    ctx.lineTo(cx + cr.sz / 2, cy + cr.sz);
    ctx.moveTo(cx + cr.sz / 2, cy);
    ctx.lineTo(cx - cr.sz / 2, cy + cr.sz);
    ctx.stroke();
    // Border
    ctx.strokeStyle = "#6a5820";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(cx - cr.sz / 2, cy, cr.sz, cr.sz);
  }

  // ---- Cannon (sits on platform, right side) ----
  const cannonAge = now - depot.cannonFireTime;
  const recoil = cannonAge < 300 ? Math.max(0, 1 - cannonAge / 300) * 6 : 0;
  const cannonBaseX = depot.x + 18;
  const cannonBaseY = topY;

  // Cannon wheel/base
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

  // Cannon barrel (points upward with slight tilt, recoils when fired)
  ctx.save();
  ctx.translate(cannonBaseX, cannonBaseY - 6);
  ctx.rotate(-0.15); // Slight tilt
  ctx.fillStyle = "#555d70";
  ctx.fillRect(-3.5, -18 + recoil, 7, 18);
  // Barrel mouth
  ctx.fillStyle = "#1a1f2e";
  ctx.fillRect(-2.5, -18 + recoil, 5, 2);
  // Barrel rim
  ctx.fillStyle = "#6a7080";
  ctx.fillRect(-4.5, -19 + recoil, 9, 3);
  ctx.restore();

  // ---- Cannon smoke ----
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

  // ---- "AMMO" label ----
  ctx.fillStyle = "#8090a0";
  ctx.font = "bold 6px monospace";
  ctx.textAlign = "center";
  ctx.fillText("AMMO", depot.x, topY + hd - 4);

  // ---- Waterline highlight ----
  ctx.beginPath();
  ctx.moveTo(depot.x - hw + 5, topY + hd);
  ctx.lineTo(depot.x + hw - 5, topY + hd);
  ctx.strokeStyle = "rgba(100, 160, 200, 0.15)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

// ==================== RENDERING: PICKUPS ====================

/**
 * Draw all active pickups with visual effects.
 * Called within a camera-translated context (world coordinates).
 *
 * Draws:
 * - Underwater pickups (health/repair) with glow, cross shape, label, bubbles
 * - Emergency ammo crate (gold box with parachute or bullet icons)
 * - Rare ammo drop (blue box with "+20" label, blinks near despawn)
 */
export function drawPickups(ctx: CanvasRenderingContext2D) {
  const now = performance.now();

  // ==================== UNDERWATER PICKUPS (health/repair) ====================
  for (const p of powerups) {
    if (!p.alive) continue;
    const age = now - p.spawnTime;
    const timeLeft = POWERUP_LIFETIME - age;

    // ---- Blink when about to despawn (last 4 seconds) ----
    if (!p.sinking && timeLeft < 4000) {
      const blinkRate = timeLeft < 2000 ? 100 : 250;
      if (Math.floor(now / blinkRate) % 2 === 0) continue;
    }

    // Gentle bobbing when settled
    const bob = p.sinking ? 0 : Math.sin(age / 500) * 4;
    const py = p.y + bob;

    // Fade in during sinking phase
    const sinkAlpha = p.sinking ? Math.min((p.y - (p.targetY - 80)) / 40, 1) : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0.2, sinkAlpha);
    ctx.translate(p.x, py);

    // ---- Glow effect (color matches type) ----
    ctx.shadowColor = p.type === "health"
      ? "rgba(217, 54, 54, 0.7)"
      : "rgba(90, 170, 153, 0.7)";
    ctx.shadowBlur = 18;

    // ---- Cross shape ----
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

    // ---- Bubble trail while sinking ----
    if (p.sinking) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      for (let i = 0; i < 3; i++) {
        const bx = Math.sin(age / 300 + i * 2) * 6;
        const by = -12 - i * 8 - (age / 80 % 20);
        ctx.beginPath();
        ctx.arc(bx, by, 1.5 + i * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 220, 255, ${0.4 - i * 0.1})`;
        ctx.fill();
      }
    }

    // ---- Text label above cross ----
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.type === "health" ? "HP" : "Barrier", 0, -14);

    ctx.restore();
  }

  // ==================== EMERGENCY AMMO CRATE (cannon-launched) ====================
  if (ammoCrate) {
    const age = now - ammoCrate.spawnTime;
    const s = AMMO_BOX_SIZE;

    ctx.save();

    if (ammoCrate.phase === "launching") {
      // ---- Launching phase: crate with smoke trail ----
      ctx.translate(ammoCrate.x, ammoCrate.y);

      // Smoke trail particles behind the crate
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

      // Draw the crate body
      drawAmmoCrateBox(ctx, s);

    } else if (ammoCrate.phase === "parachuting") {
      // ---- Parachuting phase: crate with deployed parachute ----
      const swayX = Math.sin(age / 600) * 8;
      ctx.translate(ammoCrate.x + swayX, ammoCrate.y);

      // Parachute canopy (dome shape above the crate)
      const chuteW = 32;
      const chuteH = 20;
      const chuteY = -s / 2 - 8 - chuteH;

      // Canopy fill (olive/tan military style)
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

      // Canopy panels (vertical lines)
      ctx.strokeStyle = "#706040";
      ctx.lineWidth = 0.5;
      for (let i = -2; i <= 2; i++) {
        const px = i * (chuteW / 3);
        ctx.beginPath();
        ctx.moveTo(px, chuteY + 2);
        ctx.lineTo(px * 0.6, chuteY + chuteH);
        ctx.stroke();
      }

      // Parachute strings (from canopy edges to crate)
      ctx.strokeStyle = "#a09070";
      ctx.lineWidth = 0.7;
      for (const sx of [-chuteW + 4, -chuteW / 2, 0, chuteW / 2, chuteW - 4]) {
        ctx.beginPath();
        ctx.moveTo(sx, chuteY + chuteH);
        ctx.lineTo(sx > 0 ? s / 2 - 2 : -s / 2 + 2, -s / 2 - 2);
        ctx.stroke();
      }

      // Draw the crate body
      drawAmmoCrateBox(ctx, s);

    } else {
      // ---- Landed phase: gentle bobbing ----
      const t = age / 400;
      const bobY = ammoCrate.y + Math.sin(t) * 4;
      ctx.translate(ammoCrate.x, bobY);
      drawAmmoCrateBox(ctx, s);
    }

    // "Ammo" label above crate
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    const labelY = ammoCrate.phase === "parachuting" ? -s / 2 - 36 : -s / 2 - 6;
    ctx.fillText("Ammo", 0, labelY);

    ctx.restore();
  }

  // ==================== RARE AMMO DROP (blue box) ====================
  if (ammoDrop) {
    const t = (now - ammoDrop.spawnTime) / 500;
    const bobY = ammoDrop.y + Math.sin(t) * 5;
    const s = AMMO_BOX_SIZE * 0.85;
    const fadeAge = (now - ammoDrop.spawnTime) / AMMO_DROP_LIFETIME;
    const blinkAlpha = fadeAge > 0.7
      ? (Math.sin(now / 150) > 0 ? 1 : 0.3)
      : 1;
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

// ==================== RENDERING: AMMO CRATE BOX (shared helper) ====================

/**
 * Draw the gold ammo crate box at the current transform origin.
 * Used by all crate phases (launching, parachuting, landed).
 */
function drawAmmoCrateBox(ctx: CanvasRenderingContext2D, s: number) {
  // Crate body
  ctx.fillStyle = "#c8a020";
  ctx.fillRect(-s / 2, -s / 2, s, s);
  // Lid highlight
  ctx.fillStyle = "#f0c830";
  ctx.fillRect(-s / 2, -s / 2, s, s * 0.35);
  // Bullet icons (3 small vertical rounds)
  ctx.fillStyle = "#805a00";
  const bw = 3, bh = 10;
  ctx.fillRect(-bw * 2, -bh / 2 + 2, bw, bh);
  ctx.fillRect(-bw / 2, -bh / 2 + 2, bw, bh);
  ctx.fillRect(bw, -bh / 2 + 2, bw, bh);
  // Bullet tips
  ctx.fillStyle = "#d4a017";
  ctx.beginPath();
  ctx.arc(-bw * 2 + bw / 2, -bh / 2 + 2, bw / 2 + 0.5, Math.PI, 0);
  ctx.arc(-bw / 2 + bw / 2, -bh / 2 + 2, bw / 2 + 0.5, Math.PI, 0);
  ctx.arc(bw + bw / 2, -bh / 2 + 2, bw / 2 + 0.5, Math.PI, 0);
  ctx.fill();
  // Border
  ctx.strokeStyle = "#604800";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-s / 2, -s / 2, s, s);
}

// ==================== RENDERING: HUD ALERT ====================

/**
 * Draw the ammo crate alert on the HUD.
 * Shows a flashing "AMMO CRATE LAUNCHED" message when a new crate is fired.
 *
 * @param ctx - Canvas context (in screen/HUD space)
 * @param hudX - HUD left margin
 * @param hudY - HUD top position
 */
export function drawAmmoCrateAlert(ctx: CanvasRenderingContext2D, hudX: number, hudY: number) {
  if (ammoCrate && ammoCrateAlert > 0) {
    const flash = Math.sin(performance.now() / 200) > 0;
    if (flash) {
      ctx.fillStyle = "#f0c830";
      ctx.fillText("▼ AMMO CRATE LAUNCHED ▼", hudX, hudY);
    }
  }
}
