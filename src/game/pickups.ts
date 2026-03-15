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
 * 3. **Ammo Crate** (gold box, labeled "Ammo")
 *    - Fully restores ammo to max (60)
 *    - Spawns at world edges when ammo drops below threshold (12)
 *    - Only one can exist at a time
 *    - Persists until collected (no despawn timer)
 *
 * 4. **Rare Ammo Drop** (blue box, labeled "+20")
 *    - Restores 20 ammo (capped at max)
 *    - Spawns periodically every 40–80 seconds
 *    - Despawns after 20 seconds if not collected
 *    - Blinks when about to despawn
 *
 * Rules:
 * - Only ONE of each underwater type (health/repair) can exist at a time
 * - Only ONE ammo crate and ONE rare drop can exist at a time
 * - Underwater pickups bob gently and blink before despawning (18s)
 * - Ammo crates bob at their spawn position in the air
 */

import { getWaterSurfaceY } from "./water";

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

/**
 * An ammo pickup (crate or rare drop).
 * Floats in the air at its spawn position with a gentle bob.
 */
export interface AmmoBox {
  x: number;         // World X position
  y: number;         // World Y position
  spawnTime: number;  // performance.now() timestamp of spawn
}

// ==================== MODULE STATE ====================

// --- Underwater pickups (health/repair) ---
let powerups: Powerup[] = [];
let nextHealthReward = 1500;   // Score threshold for next health kit
let nextRepairReward = 1200;   // Score threshold for next repair kit

// --- Ammo crate (emergency, spawns when ammo is low) ---
let ammoCrate: AmmoBox | null = null;
let ammoCrateAlert = 0;        // HUD flash timer (ms remaining)

// --- Rare ammo drop (periodic bonus) ---
let ammoDrop: AmmoBox | null = null;
let ammoDropTimer = 30 + Math.random() * 30; // Countdown to first drop (seconds)

// ==================== RESET ====================

/**
 * Reset all pickup state. Called at game start and between waves.
 */
export function resetPickups() {
  // Underwater pickups
  powerups = [];
  nextHealthReward = 1500;
  nextRepairReward = 1200;

  // Ammo crates
  ammoCrate = null;
  ammoCrateAlert = 0;
  ammoDrop = null;
  ammoDropTimer = 30 + Math.random() * 30;
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

// ==================== AMMO CRATE SPAWNING & COLLISION ====================

/**
 * Check if an emergency ammo crate should spawn (ammo low)
 * and handle player collision with it.
 *
 * @param ammo - Current player ammo count
 * @param playerX - Player X position
 * @param playerY - Player Y position
 * @param playerRadius - Player collision radius
 * @param worldWidth - Total world width
 * @param viewH - Logical view height
 * @param frameDelta - Frame delta in ms (for alert timer)
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
  // Spawn crate at world edge when ammo is low
  if (ammo <= AMMO_LOW_THRESHOLD && !ammoCrate) {
    const edgeX = Math.random() < 0.5 ? 20 : worldWidth - 20;
    const surfY = getWaterSurfaceY(viewH);
    const boxY = 40 + Math.random() * (surfY - 80);
    ammoCrate = { x: edgeX, y: boxY, spawnTime: performance.now() };
    ammoCrateAlert = 3000;
  }

  // Tick down alert timer
  if (ammoCrateAlert > 0) {
    ammoCrateAlert -= frameDelta;
  }

  // Check player collision with crate
  if (ammoCrate) {
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

// ==================== RENDERING ====================

/**
 * Draw all active pickups with visual effects.
 * Called within a camera-translated context (world coordinates).
 *
 * Draws:
 * - Underwater pickups (health/repair) with glow, cross shape, label, bubbles
 * - Emergency ammo crate (gold box with bullet icons)
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

  // ==================== EMERGENCY AMMO CRATE (gold box) ====================
  if (ammoCrate) {
    const t = (now - ammoCrate.spawnTime) / 400;
    const bobY = ammoCrate.y + Math.sin(t) * 4;
    const s = AMMO_BOX_SIZE;
    ctx.save();
    ctx.translate(ammoCrate.x, bobY);
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
    // "Ammo" label
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Ammo", 0, -s / 2 - 6);
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

/**
 * Draw the ammo crate alert on the HUD.
 * Shows a flashing "AMMO CRATE SPAWNED" message when a new crate appears.
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
      ctx.fillText("▼ AMMO CRATE SPAWNED ▼", hudX, hudY);
    }
  }
}
