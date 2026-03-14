/**
 * powerups.ts — Collectible Power-up System
 * 
 * Two types of power-ups drop from the floating city and slowly
 * sink underwater for the player to collect:
 * 
 * 1. **Health Kit** (red cross, labeled "HP")
 *    - Restores 1 player HP
 *    - Spawns every 1500 points
 * 
 * 2. **Barrier Repair** (green cross, labeled "Barrier")
 *    - Restores 3 city/barrier HP
 *    - Spawns every 1200 points
 * 
 * Rules:
 * - Only ONE of each type can exist at a time (prevents spam)
 * - Power-ups spawn at the city's waterline and sink slowly to a target depth
 * - They bob gently when settled and blink before despawning (18 seconds)
 * - Spawn thresholds are relative to current score (not fixed values)
 */

import { getWaterSurfaceY } from "./water";

// ==================== TYPES & CONSTANTS ====================

/** The two power-up types */
export type PowerupType = "health" | "repair";

/** How long a power-up exists before despawning (milliseconds) */
const POWERUP_LIFETIME = 18000; // 18 seconds

/** How fast power-ups sink toward their target depth (pixels/frame) */
const SINK_SPEED = 0.3;

// ==================== INTERFACE ====================

/** A collectible power-up entity */
export interface Powerup {
  x: number;          // World X position
  y: number;          // Current Y position (changes while sinking)
  targetY: number;    // Final resting depth (stops sinking here)
  type: PowerupType;  // "health" or "repair"
  spawnTime: number;  // performance.now() timestamp of spawn
  alive: boolean;     // false = collected or despawned
  sinking: boolean;   // true while still falling to target depth
}

// ==================== MODULE STATE ====================

let powerups: Powerup[] = [];
let nextHealthReward = 1500;   // Score threshold for next health kit
let nextRepairReward = 1200;   // Score threshold for next repair kit

// ==================== RESET & ACCESSORS ====================

/** Reset power-up state. Called at game start and between waves. */
export function resetPowerups() {
  powerups = [];
  nextHealthReward = 1500;
  nextRepairReward = 1200;
}

/** Get the current list of active power-ups */
export function getPowerups() { return powerups; }

// ==================== SPAWN LOGIC ====================

/**
 * Check if a power-up of the given type already exists on screen.
 * Used to enforce the "max 1 of each type" rule.
 */
function hasActiveType(type: PowerupType): boolean {
  return powerups.some(p => p.alive && p.type === type);
}

/**
 * Check if the player's score has reached a reward threshold.
 * If so, spawn a new power-up at the city's waterline.
 * 
 * The next threshold is set relative to the current score,
 * preventing "catch-up" spawning where multiple items appear at once.
 * 
 * @param score - Current player score
 * @param boatX - City center X position
 * @param boatWidth - City platform width
 * @param viewH - Logical view height
 */
export function checkScoreRewards(score: number, boatX: number, boatWidth: number, viewH: number) {
  const surfaceY = getWaterSurfaceY(viewH);

  // Health kit: only spawn if none currently exists
  if (score >= nextHealthReward && !hasActiveType("health")) {
    nextHealthReward = score + 1500; // Next one 1500 points from NOW
    const spawnX = boatX + (Math.random() - 0.5) * boatWidth * 0.4;
    powerups.push({
      x: spawnX,
      y: surfaceY - 5,  // Start at city bottom (water line)
      targetY: surfaceY + 60 + Math.random() * 40,  // Random depth to settle at
      type: "health",
      spawnTime: performance.now(),
      alive: true,
      sinking: true,
    });
  }

  // Repair kit: only spawn if none currently exists
  if (score >= nextRepairReward && !hasActiveType("repair")) {
    nextRepairReward = score + 1200; // Next one 1200 points from NOW
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

// ==================== COLLISION ====================

/**
 * Check if the player is close enough to pick up a power-up.
 * If so, marks it as dead and returns its type.
 * 
 * @param px - Player X position
 * @param py - Player Y position
 * @param radius - Player collision radius
 * @returns The type of power-up collected, or null if none
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

// ==================== UPDATE ====================

/**
 * Update all power-ups: sink toward target depth, check lifetime.
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
        p.sinking = false;  // Reached target — start bobbing
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
 * Draw all active power-ups with visual effects.
 * Includes: glow, cross shape, label text, bubble trail while sinking,
 * and blinking effect near despawn time.
 */
export function drawPowerups(ctx: CanvasRenderingContext2D) {
  const now = performance.now();
  for (const p of powerups) {
    if (!p.alive) continue;
    const age = now - p.spawnTime;
    const timeLeft = POWERUP_LIFETIME - age;

    // ---- Blink when about to despawn (last 4 seconds) ----
    if (!p.sinking && timeLeft < 4000) {
      const blinkRate = timeLeft < 2000 ? 100 : 250;  // Faster blink when very close
      if (Math.floor(now / blinkRate) % 2 === 0) {
        continue;  // Skip drawing this frame (blink off)
      }
    }

    // Gentle bobbing when settled (not while sinking)
    const bob = p.sinking ? 0 : Math.sin(age / 500) * 4;
    const py = p.y + bob;

    // Fade in during sinking phase
    const sinkAlpha = p.sinking ? Math.min((p.y - (p.targetY - 80)) / 40, 1) : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0.2, sinkAlpha);
    ctx.translate(p.x, py);

    // ---- Glow effect (color matches power-up type) ----
    ctx.shadowColor = p.type === "health" ? "rgba(217, 54, 54, 0.7)" : "rgba(90, 170, 153, 0.7)";
    ctx.shadowBlur = 18;

    // ---- Cross shape (different colors for each type) ----
    if (p.type === "health") {
      // Red cross
      ctx.fillStyle = "#D93636";
      ctx.fillRect(-8, -3, 16, 6);   // Horizontal bar
      ctx.fillRect(-3, -8, 6, 16);   // Vertical bar
      ctx.strokeStyle = "#ff8888";
      ctx.lineWidth = 1;
      ctx.strokeRect(-8, -3, 16, 6);
      ctx.strokeRect(-3, -8, 6, 16);
    } else {
      // Green cross (repair)
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
        const bx = (Math.sin(age / 300 + i * 2) * 6);
        const by = -12 - i * 8 - (age / 80 % 20);
        ctx.beginPath();
        ctx.arc(bx, by, 1.5 + i * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 220, 255, ${0.4 - i * 0.1})`;
        ctx.fill();
      }
    }

    // ---- Text label above the cross ----
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.type === "health" ? "HP" : "Barrier", 0, -14);

    ctx.restore();
  }
}
