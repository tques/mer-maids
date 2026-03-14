// Powerup system: health kits and boat repair drop from the city and sink slowly

import { getWaterSurfaceY } from "./water";

export type PowerupType = "health" | "repair";

const POWERUP_LIFETIME = 18000; // 18 seconds before despawn
const SINK_SPEED = 0.3; // pixels per frame — very slow descent

export interface Powerup {
  x: number;
  y: number;
  targetY: number; // final resting depth
  type: PowerupType;
  spawnTime: number;
  alive: boolean;
  sinking: boolean; // true while still falling
}

let powerups: Powerup[] = [];
let nextHealthReward = 1500;
let nextRepairReward = 1200;

export function resetPowerups() {
  powerups = [];
  nextHealthReward = 1500;
  nextRepairReward = 1200;
}

export function getPowerups() { return powerups; }

function hasActiveType(type: PowerupType): boolean {
  return powerups.some(p => p.alive && p.type === type);
}

export function checkScoreRewards(score: number, boatX: number, boatWidth: number, viewH: number) {
  const surfaceY = getWaterSurfaceY(viewH);

  // Health: only spawn if none currently exists
  if (score >= nextHealthReward && !hasActiveType("health")) {
    nextHealthReward = score + 1500; // next one 1500 points from NOW
    const spawnX = boatX + (Math.random() - 0.5) * boatWidth * 0.4;
    powerups.push({
      x: spawnX,
      y: surfaceY - 5, // start at city bottom (water line)
      targetY: surfaceY + 60 + Math.random() * 40,
      type: "health",
      spawnTime: performance.now(),
      alive: true,
      sinking: true,
    });
  }

  // Repair: only spawn if none currently exists
  if (score >= nextRepairReward && !hasActiveType("repair")) {
    nextRepairReward = score + 1200; // next one 1200 points from NOW
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

export function updatePowerups() {
  const now = performance.now();
  for (const p of powerups) {
    if (!p.alive) continue;

    // Sink slowly toward target
    if (p.sinking) {
      p.y += SINK_SPEED;
      if (p.y >= p.targetY) {
        p.y = p.targetY;
        p.sinking = false;
      }
    }

    // Despawn after lifetime (counted from when it finishes sinking, or from spawn if still sinking)
    if (!p.sinking && now - p.spawnTime > POWERUP_LIFETIME) {
      p.alive = false;
    }
  }
  powerups = powerups.filter(p => p.alive);
}

export function drawPowerups(ctx: CanvasRenderingContext2D) {
  const now = performance.now();
  for (const p of powerups) {
    if (!p.alive) continue;
    const age = now - p.spawnTime;
    const timeLeft = POWERUP_LIFETIME - age;

    // Blink when about to despawn (last 4 seconds, only when settled)
    if (!p.sinking && timeLeft < 4000) {
      const blinkRate = timeLeft < 2000 ? 100 : 250;
      if (Math.floor(now / blinkRate) % 2 === 0) {
        continue;
      }
    }

    // Gentle bob only when settled
    const bob = p.sinking ? 0 : Math.sin(age / 500) * 4;
    const py = p.y + bob;

    // Fade in during sinking
    const sinkAlpha = p.sinking ? Math.min((p.y - (p.targetY - 80)) / 40, 1) : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0.2, sinkAlpha);
    ctx.translate(p.x, py);

    // Glow
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

    // Bubble trail while sinking
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

    // Label above
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.type === "health" ? "HP" : "Barrier", 0, -14);

    ctx.restore();
  }
}
