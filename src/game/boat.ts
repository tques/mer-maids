/**
 * boat.ts — Floating City Platform System
 *
 * Three cities, same civilization (near-future oceanic), each visually distinct:
 *
 * PORT ASTRA  (index 0, left)   — Industrial harbor. Cranes, containers, brutalist.
 *                                  Structure: Sonar Array (tall mast + dish)
 * HAVEN       (index 1, center) — Elegant city-state. Tall towers, statue, dome.
 *                                  Structure: SAM-7 launcher
 * NOVA MARE   (index 2, right)  — Research platform. Geodesic domes, solar panels.
 *                                  Structure: Shield Battery emitter tower
 */

import { getWaveY, getWaterSurfaceY } from "./water";

// ==================== INTERFACES ====================

export interface Boat {
  x: number;
  width: number;
  hullDepth: number;
  name: string;
}

export interface CityStructureState {
  hp: number;
  maxHp: number;
}

// ==================== FACTORIES ====================

export function createCities(worldWidth: number): Boat[] {
  return [
    { x: Math.floor(worldWidth * 0.17), width: 580, hullDepth: 36, name: "PORT ASTRA" },
    { x: Math.floor(worldWidth * 0.5), width: 700, hullDepth: 36, name: "HAVEN" },
    { x: Math.floor(worldWidth * 0.83), width: 580, hullDepth: 36, name: "NOVA MARE" },
  ];
}

export function createCityStructureState(): CityStructureState {
  return { hp: 3, maxHp: 3 };
}

// ==================== HELPERS ====================

export function getBoatTopY(boat: Boat, viewH: number): number {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  return waveY - 22;
}

/**
 * Returns the world position of a city's unique structure.
 * Used for mortar targeting and collision detection.
 */
export function getStructureWorldPos(boat: Boat, viewH: number): { x: number; y: number } | null {
  const topY = getBoatTopY(boat, viewH);
  const hw = boat.width / 2;
  if (boat.name === "PORT ASTRA") {
    // Sonar Array — tall mast on left side of platform
    return { x: boat.x - hw * 0.55, y: topY - 80 };
  } else if (boat.name === "HAVEN") {
    // SAM-7 — right side of platform
    return { x: boat.x + hw - 60, y: topY - 90 };
  } else if (boat.name === "NOVA MARE") {
    // Shield Battery — center-right spire
    return { x: boat.x + hw * 0.4, y: topY - 75 };
  }
  return null;
}

// ==================== SHARED PLATFORM BASE ====================

function drawPlatformBase(ctx: CanvasRenderingContext2D, boat: Boat, topY: number, hpRatio: number, exposed: boolean) {
  const hw = boat.width / 2;
  const hd = boat.hullDepth;
  const baseR = 20;

  ctx.beginPath();
  ctx.moveTo(boat.x - hw + baseR, topY + hd);
  ctx.lineTo(boat.x + hw - baseR, topY + hd);
  ctx.quadraticCurveTo(boat.x + hw, topY + hd, boat.x + hw, topY + hd - baseR);
  ctx.lineTo(boat.x + hw, topY + 4);
  ctx.quadraticCurveTo(boat.x + hw, topY, boat.x + hw - baseR, topY);
  ctx.lineTo(boat.x - hw + baseR, topY);
  ctx.quadraticCurveTo(boat.x - hw, topY, boat.x - hw, topY + 4);
  ctx.lineTo(boat.x - hw, topY + hd - baseR);
  ctx.quadraticCurveTo(boat.x - hw, topY + hd, boat.x - hw + baseR, topY + hd);
  ctx.closePath();

  const baseGrad = ctx.createLinearGradient(boat.x, topY, boat.x, topY + hd);
  if (exposed) {
    baseGrad.addColorStop(0, "rgba(30,15,10,0.9)");
    baseGrad.addColorStop(1, "rgba(20,8,5,0.95)");
  } else {
    baseGrad.addColorStop(0, "rgba(20,60,80,0.9)");
    baseGrad.addColorStop(0.5, "rgba(10,40,60,0.95)");
    baseGrad.addColorStop(1, "rgba(5,25,45,0.95)");
  }
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // Surface highlight
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + baseR, topY);
  ctx.lineTo(boat.x + hw - baseR, topY);
  ctx.quadraticCurveTo(boat.x + hw, topY, boat.x + hw - 5, topY + 5);
  ctx.lineTo(boat.x - hw + 5, topY + 5);
  ctx.quadraticCurveTo(boat.x - hw, topY, boat.x - hw + baseR, topY);
  ctx.closePath();
  ctx.fillStyle = exposed ? "rgba(80,30,10,0.2)" : "rgba(100,220,210,0.25)";
  ctx.fill();

  // Hull lines
  ctx.strokeStyle = exposed ? "rgba(100,40,20,0.15)" : "rgba(80,200,190,0.15)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const ly = topY + (hd * i) / 4;
    const shrink = i * 6;
    ctx.beginPath();
    ctx.moveTo(boat.x - hw + 10 + shrink, ly);
    ctx.lineTo(boat.x + hw - 10 - shrink, ly);
    ctx.stroke();
  }

  // City name
  ctx.save();
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = exposed ? "rgba(200,80,40,0.7)" : "rgba(100,220,210,0.85)";
  ctx.fillText(boat.name, boat.x, topY + hd - 6);
  ctx.restore();

  // Waterline
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + 10, topY + hd);
  ctx.lineTo(boat.x + hw - 10, topY + hd);
  ctx.strokeStyle = "rgba(100,160,200,0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ==================== SHARED DOME BARRIER ====================

function drawDomeBarrier(ctx: CanvasRenderingContext2D, boat: Boat, topY: number, hpRatio: number, barrierUp: boolean) {
  const hw = boat.width / 2;
  const domeRadius = hw * 0.85;
  const domeCenterY = topY;
  const now = performance.now();
  const damaged = hpRatio < 1;
  const critical = hpRatio <= 0.3;
  const flickerRate = critical ? 80 : 200;
  const flickering = damaged && Math.sin(now / flickerRate) > 0;

  if (barrierUp) {
    const domeR = Math.round(30 + (1 - hpRatio) * 200);
    const domeG = Math.round(200 * hpRatio + 40);
    const domeB = Math.round(220 * hpRatio + 30);
    const domeAlphaBase = 0.1 + (1 - hpRatio) * 0.15;

    const domeGrad = ctx.createRadialGradient(boat.x, domeCenterY, domeRadius * 0.3, boat.x, domeCenterY, domeRadius);
    domeGrad.addColorStop(0, `rgba(${domeR},${domeG},${domeB},0.01)`);
    domeGrad.addColorStop(0.6, `rgba(${domeR},${domeG},${domeB},${domeAlphaBase * 0.4})`);
    domeGrad.addColorStop(0.85, `rgba(${domeR},${domeG},${domeB},${domeAlphaBase * 0.7})`);
    domeGrad.addColorStop(1, `rgba(${domeR},${domeG},${domeB},${domeAlphaBase})`);

    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = domeGrad;
    ctx.fill();

    const outlineAlpha = critical ? (flickering ? 0.6 : 0.15) : 0.25 + (1 - hpRatio) * 0.2;
    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.strokeStyle = `rgba(${domeR + 60},${Math.min(domeG + 40, 255)},${Math.min(domeB + 55, 255)},${outlineAlpha})`;
    ctx.lineWidth = damaged ? 3 : 2;
    ctx.stroke();

    if (damaged) {
      const crackCount = Math.ceil((1 - hpRatio) * 8);
      ctx.strokeStyle = critical
        ? `rgba(255,80,40,${0.3 + Math.sin(now / 150) * 0.15})`
        : `rgba(200,220,255,${0.15 + (1 - hpRatio) * 0.15})`;
      ctx.lineWidth = critical ? 2 : 1;
      for (let i = 0; i < crackCount; i++) {
        const baseAngle = Math.PI + i * 0.9 + 0.4;
        const r1 = domeRadius * (0.5 + (i % 3) * 0.15);
        const r2 = domeRadius * (0.7 + (i % 2) * 0.2);
        const cx1 = boat.x + Math.cos(baseAngle) * r1;
        const cy1 = domeCenterY + Math.sin(baseAngle) * r1;
        const cx2 = boat.x + Math.cos(baseAngle + 0.08) * r2;
        const cy2 = domeCenterY + Math.sin(baseAngle + 0.08) * r2;
        const midR = (r1 + r2) / 2;
        const cmx = boat.x + Math.cos(baseAngle + 0.15) * midR;
        const cmy = domeCenterY + Math.sin(baseAngle - 0.05) * midR;
        if (cy1 < domeCenterY && cy2 < domeCenterY) {
          ctx.beginPath();
          ctx.moveTo(cx1, cy1);
          ctx.quadraticCurveTo(cmx, cmy, cx2, cy2);
          ctx.stroke();
        }
      }
    }
  } else {
    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.setLineDash([8, 12]);
    ctx.strokeStyle = "rgba(255,80,40,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ==================== SEEDED RAND ====================
function seededRand(seed: number): number {
  let s = seed | 0;
  s = ((s >>> 16) ^ s) * 0x45d9f3b;
  s = ((s >>> 16) ^ s) * 0x45d9f3b;
  s = (s >>> 16) ^ s;
  return (s & 0xffff) / 0xffff;
}

// ==================== PORT ASTRA ====================
// Industrial harbor — brutalist, heavy, utilitarian
// Cranes, stacked containers, comm towers, smokestacks

function drawPortAstra(
  ctx: CanvasRenderingContext2D,
  boat: Boat,
  viewH: number,
  hpRatio: number,
  barrierUp: boolean,
  structHp: number,
) {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  const topY = waveY - 22;
  const hw = boat.width / 2;
  const now = performance.now();
  const exposed = !barrierUp;
  const critical = hpRatio <= 0.3;
  const damaged = hpRatio < 1;

  ctx.save();

  // Platform base first
  drawPlatformBase(ctx, boat, topY, hpRatio, exposed);

  const scale = boat.width / 700;

  // ---- Colour palette ----
  const steelDark = exposed ? "#1e1008" : "#1e2a30";
  const steelMid = exposed ? "#2e1810" : "#2e3e48";
  const steelLight = exposed ? "#3e2818" : "#3e5060";
  const accent = exposed ? "#8a3010" : "#4a7080";
  const rustRed = "#8a3020";
  const yellow = exposed ? "#6a3010" : "#c8a030";
  const glowG = exposed ? "rgba(200,80,40,0.7)" : "rgba(80,200,180,0.7)";

  type BldDef = { ox: number; w: number; h: number; style: "block" | "tower" | "warehouse" };
  const buildings: BldDef[] = (
    [
      { ox: -240, w: 60, h: 30, style: "warehouse" },
      { ox: -170, w: 40, h: 50, style: "block" },
      { ox: -118, w: 32, h: 65, style: "tower" },
      { ox: -75, w: 50, h: 40, style: "warehouse" },
      { ox: -15, w: 36, h: 72, style: "block" },
      { ox: 32, w: 44, h: 55, style: "block" },
      { ox: 90, w: 36, h: 48, style: "tower" },
      { ox: 140, w: 55, h: 35, style: "warehouse" },
      { ox: 205, w: 38, h: 58, style: "block" },
    ] as const
  ).map((b) => ({ ...b, ox: b.ox * scale, w: b.w * scale, h: b.h * scale }));

  for (const b of buildings) {
    const bx = boat.x + b.ox;
    const by = topY - b.h;
    ctx.fillStyle = steelMid;
    if (b.style === "warehouse") {
      // Wide low warehouse with sawtooth roof
      ctx.fillRect(bx - b.w / 2, by, b.w, b.h);
      ctx.fillStyle = steelDark;
      // Roof ridges
      const ridges = 3;
      for (let r = 0; r < ridges; r++) {
        const rx = bx - b.w / 2 + (r / ridges) * b.w;
        ctx.beginPath();
        ctx.moveTo(rx, by);
        ctx.lineTo(rx + b.w / ridges / 2, by - 6 * scale);
        ctx.lineTo(rx + b.w / ridges, by);
        ctx.closePath();
        ctx.fill();
      }
      // Windows as slits
      ctx.fillStyle = glowG;
      const winCount = Math.floor(b.w / (10 * scale));
      for (let wi = 0; wi < winCount; wi++) {
        ctx.fillRect(bx - b.w / 2 + 4 * scale + wi * 10 * scale, by + b.h * 0.4, 4 * scale, b.h * 0.25);
      }
    } else if (b.style === "block") {
      ctx.fillRect(bx - b.w / 2, by, b.w, b.h);
      // Horizontal band stripes
      ctx.fillStyle = steelDark;
      ctx.fillRect(bx - b.w / 2, by + b.h * 0.33, b.w, 3 * scale);
      ctx.fillRect(bx - b.w / 2, by + b.h * 0.66, b.w, 3 * scale);
      // Windows
      ctx.fillStyle = glowG;
      const rows = 3,
        cols = Math.max(2, Math.floor(b.w / (10 * scale)));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (seededRand(b.ox * 100 + r * 10 + c) > 0.4) {
            ctx.fillRect(
              bx - b.w / 2 + 4 * scale + (c * (b.w - 8 * scale)) / cols,
              by + 6 * scale + (r * (b.h - 12 * scale)) / rows,
              4 * scale,
              4 * scale,
            );
          }
        }
      }
    } else {
      // Tower — narrower, taller, stepped top
      ctx.fillRect(bx - b.w / 2, by, b.w, b.h);
      ctx.fillStyle = steelLight;
      ctx.fillRect(bx - b.w / 4, by - 8 * scale, b.w / 2, 8 * scale);
      // Antenna
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(bx, by - 8 * scale);
      ctx.lineTo(bx, by - 22 * scale);
      ctx.stroke();
      ctx.fillStyle = exposed ? "#ff4000" : "#00ffcc";
      ctx.beginPath();
      ctx.arc(bx, by - 22 * scale, 2.5 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rust streaks on all buildings
    ctx.strokeStyle = `rgba(100,40,20,0.2)`;
    ctx.lineWidth = 1;
    for (let rs = 0; rs < 2; rs++) {
      const rx = bx - b.w / 4 + (seededRand(b.ox * 200 + rs) * b.w) / 2;
      ctx.beginPath();
      ctx.moveTo(rx, by);
      ctx.lineTo(rx + 2, by + b.h * 0.4);
      ctx.stroke();
    }
  }

  // ---- Cranes (2 large industrial cranes) ----
  const cranes = [
    { ox: -200 * scale, h: 90 * scale, dir: 1 },
    { ox: 170 * scale, h: 80 * scale, dir: -1 },
  ];
  for (const cr of cranes) {
    const cx = boat.x + cr.ox;
    const cy = topY;
    ctx.strokeStyle = exposed ? "#5a2010" : "#5a8090";
    ctx.lineWidth = 4 * scale;
    // Vertical mast
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - cr.h);
    ctx.stroke();
    // Horizontal boom
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(cx - 15 * scale * cr.dir, cy - cr.h);
    ctx.lineTo(cx + 45 * scale * cr.dir, cy - cr.h);
    ctx.stroke();
    // Diagonal support
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy - cr.h * 0.6);
    ctx.lineTo(cx + 45 * scale * cr.dir, cy - cr.h);
    ctx.stroke();
    // Cable
    ctx.lineWidth = 1;
    ctx.strokeStyle = exposed ? "#3a1008" : "#3a6070";
    ctx.beginPath();
    ctx.moveTo(cx + 30 * scale * cr.dir, cy - cr.h);
    ctx.lineTo(cx + 30 * scale * cr.dir, cy - cr.h * 0.35);
    ctx.stroke();
    // Hook
    ctx.beginPath();
    ctx.arc(cx + 30 * scale * cr.dir, cy - cr.h * 0.3, 4 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = exposed ? "#5a2010" : "#5a8090";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ---- Stacked containers ----
  const containerColors = [
    exposed ? "#5a1010" : "#c84040",
    exposed ? "#1a2a10" : "#208040",
    exposed ? "#1a1a3a" : "#2040a0",
    exposed ? "#4a3010" : "#c89030",
  ];
  const containers = [
    { ox: -60 * scale, row: 0 },
    { ox: -30 * scale, row: 0 },
    { ox: 0, row: 0 },
    { ox: -45 * scale, row: 1 },
    { ox: -15 * scale, row: 1 },
    { ox: -30 * scale, row: 2 },
  ];
  const cw = 26 * scale,
    ch = 12 * scale;
  for (const c of containers) {
    const cx2 = boat.x + hw * 0.3 + c.ox;
    const cy2 = topY - c.row * (ch + 1) - ch;
    const col = containerColors[(Math.abs(c.ox / scale) + c.row * 3) % 4];
    ctx.fillStyle = col;
    ctx.fillRect(cx2, cy2, cw, ch);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx2, cy2, cw, ch);
    // Container ridges
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(cx2 + cw * 0.33, cy2);
    ctx.lineTo(cx2 + cw * 0.33, cy2 + ch);
    ctx.moveTo(cx2 + cw * 0.66, cy2);
    ctx.lineTo(cx2 + cw * 0.66, cy2 + ch);
    ctx.stroke();
  }

  // ---- Smokestack ----
  const sx = boat.x - hw * 0.15;
  ctx.fillStyle = steelDark;
  ctx.fillRect(sx - 8 * scale, topY - 55 * scale, 16 * scale, 55 * scale);
  ctx.fillStyle = steelLight;
  ctx.fillRect(sx - 10 * scale, topY - 58 * scale, 20 * scale, 6 * scale);
  // Smoke puffs
  if (!exposed) {
    ctx.globalAlpha = 0.18;
    for (let p = 0; p < 4; p++) {
      const py = topY - 65 * scale - p * 14 * scale - ((now / 40) % 14) * scale;
      const pr = (4 + p * 3) * scale;
      ctx.beginPath();
      ctx.arc(sx + Math.sin(now * 0.001 + p) * 4 * scale, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = "#aab0b8";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---- Sonar Array Structure ----
  const sonarX = boat.x - hw * 0.55;
  const sonarBaseY = topY;
  const sonarAlive = structHp > 0;
  const mastH = 90 * scale;

  if (sonarAlive) {
    // Mast
    ctx.strokeStyle = exposed ? "#5a2010" : "#6a9aaa";
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.moveTo(sonarX, sonarBaseY);
    ctx.lineTo(sonarX, sonarBaseY - mastH);
    ctx.stroke();
    // Cross braces
    ctx.lineWidth = 2 * scale;
    for (let br = 1; br <= 3; br++) {
      const by2 = sonarBaseY - (mastH * br) / 4;
      ctx.beginPath();
      ctx.moveTo(sonarX - 12 * scale, by2);
      ctx.lineTo(sonarX + 12 * scale, by2);
      ctx.stroke();
    }
    // Dish
    const dishY = sonarBaseY - mastH;
    const dishR = 22 * scale;
    const wobble = Math.sin(now * 0.0008) * 0.3;
    ctx.save();
    ctx.translate(sonarX, dishY);
    ctx.rotate(wobble);
    ctx.beginPath();
    ctx.arc(0, 0, dishR, Math.PI * 0.2, Math.PI * 0.8);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = exposed ? "#3a1808" : "#2a4a5a";
    ctx.fill();
    ctx.strokeStyle = exposed ? "#6a3020" : "#5a9aaa";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Dish inner ribs
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(0, 0, (dishR * r) / 3.5, Math.PI * 0.2, Math.PI * 0.8);
      ctx.strokeStyle = `rgba(90,160,180,0.3)`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    // Centre emitter
    ctx.beginPath();
    ctx.arc(0, 0, 3 * scale, 0, Math.PI * 2);
    const pulse = 0.6 + Math.sin(now * 0.004) * 0.4;
    ctx.fillStyle = exposed ? `rgba(255,80,40,${pulse})` : `rgba(80,220,200,${pulse})`;
    ctx.fill();
    // Rotating scan beam
    const scanAngle = (now * 0.0015) % (Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(scanAngle) * dishR * 0.85, Math.sin(scanAngle) * dishR * 0.85);
    ctx.strokeStyle = exposed ? "rgba(255,80,40,0.4)" : "rgba(80,220,200,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  } else {
    // Destroyed — toppled mast stub
    ctx.save();
    ctx.translate(sonarX, sonarBaseY);
    ctx.rotate(0.5);
    ctx.strokeStyle = "#5a3020";
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -mastH * 0.5);
    ctx.stroke();
    ctx.restore();
    // Debris
    ctx.fillStyle = "#4a3020";
    ctx.fillRect(sonarX - 18 * scale, sonarBaseY - 6 * scale, 8 * scale, 5 * scale);
    ctx.fillRect(sonarX + 6 * scale, sonarBaseY - 4 * scale, 10 * scale, 4 * scale);
  }

  // Damage smoke
  if (exposed) {
    ctx.globalAlpha = 0.3 + Math.sin(now / 200) * 0.1;
    for (let i = 0; i < 5; i++) {
      const smokeX = boat.x + Math.sin(now / 800 + i * 1.3) * hw * 0.5;
      const smokeY = topY - 20 - ((now / 50 + i * 30) % 60);
      ctx.beginPath();
      ctx.arc(smokeX, smokeY, 6 + Math.sin(now / 300 + i) * 3, 0, Math.PI * 2);
      ctx.fillStyle = critical ? "rgba(200,60,20,0.3)" : "rgba(80,80,80,0.25)";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawDomeBarrier(ctx, boat, topY, hpRatio, barrierUp);
  ctx.restore();
}

// ==================== HAVEN ====================
// Preserved from original — elegant city-state with SAM-7 and statue

function drawHaven(
  ctx: CanvasRenderingContext2D,
  boat: Boat,
  viewH: number,
  hpRatio: number,
  barrierUp: boolean,
  structHp: number,
) {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  const topY = waveY - 22;
  const hw = boat.width / 2;
  const now = performance.now();
  const exposed = !barrierUp;
  const critical = hpRatio <= 0.3;
  const damaged = hpRatio < 1;

  ctx.save();
  drawPlatformBase(ctx, boat, topY, hpRatio, exposed);

  const seededRandH = (seed: number) => {
    let s = seed | 0;
    s = ((s >>> 16) ^ s) * 0x45d9f3b;
    s = ((s >>> 16) ^ s) * 0x45d9f3b;
    s = (s >>> 16) ^ s;
    return (s & 0xffff) / 0xffff;
  };

  type BldStyle = "rect" | "dome" | "spire" | "stepped" | "cylinder";
  type BldDef = { ox: number; w: number; h: number; s: BldStyle };

  const scale = boat.width / 700;

  const backBuildings: BldDef[] = (
    [
      { ox: -260, w: 30, h: 28, s: "rect" },
      { ox: -220, w: 24, h: 35, s: "dome" },
      { ox: -185, w: 28, h: 32, s: "cylinder" },
      { ox: -150, w: 22, h: 42, s: "spire" },
      { ox: -115, w: 26, h: 38, s: "stepped" },
      { ox: -85, w: 20, h: 48, s: "dome" },
      { ox: -55, w: 24, h: 44, s: "rect" },
      { ox: -25, w: 22, h: 55, s: "spire" },
      { ox: 5, w: 28, h: 60, s: "cylinder" },
      { ox: 35, w: 24, h: 52, s: "stepped" },
      { ox: 65, w: 20, h: 46, s: "dome" },
      { ox: 90, w: 26, h: 40, s: "rect" },
      { ox: 120, w: 22, h: 50, s: "spire" },
      { ox: 148, w: 28, h: 36, s: "dome" },
      { ox: 178, w: 24, h: 42, s: "cylinder" },
      { ox: 208, w: 20, h: 34, s: "stepped" },
      { ox: 232, w: 26, h: 30, s: "rect" },
    ] as const
  ).map((b) => ({ ...b, ox: b.ox * scale, w: b.w * scale, h: b.h * scale }));

  const buildings: BldDef[] = (
    [
      { ox: -270, w: 22, h: 22, s: "dome" },
      { ox: -248, w: 26, h: 30, s: "stepped" },
      { ox: -222, w: 20, h: 38, s: "spire" },
      { ox: -200, w: 28, h: 32, s: "cylinder" },
      { ox: -172, w: 24, h: 45, s: "rect" },
      { ox: -145, w: 30, h: 50, s: "dome" },
      { ox: -115, w: 22, h: 58, s: "spire" },
      { ox: -90, w: 26, h: 48, s: "stepped" },
      { ox: -64, w: 20, h: 62, s: "cylinder" },
      { ox: -40, w: 28, h: 70, s: "dome" },
      { ox: -12, w: 24, h: 78, s: "rect" },
      { ox: 15, w: 36, h: 90, s: "spire" },
      { ox: 45, w: 24, h: 75, s: "stepped" },
      { ox: 70, w: 28, h: 65, s: "dome" },
      { ox: 98, w: 22, h: 55, s: "cylinder" },
      { ox: 122, w: 26, h: 60, s: "rect" },
      { ox: 150, w: 24, h: 48, s: "spire" },
      { ox: 175, w: 20, h: 52, s: "dome" },
      { ox: 198, w: 28, h: 42, s: "stepped" },
      { ox: 225, w: 22, h: 35, s: "cylinder" },
      { ox: 248, w: 26, h: 28, s: "rect" },
    ] as const
  ).map((b) => ({ ...b, ox: b.ox * scale, w: b.w * scale, h: b.h * scale }));

  function traceBldShape(bx: number, by: number, w: number, h: number, s: BldStyle) {
    const hw2 = w / 2;
    ctx.beginPath();
    switch (s) {
      case "dome":
        ctx.moveTo(bx - hw2, by + h);
        ctx.lineTo(bx - hw2, by + 10);
        ctx.arc(bx, by + 10, hw2, Math.PI, 0);
        ctx.lineTo(bx + hw2, by + h);
        ctx.closePath();
        break;
      case "spire":
        ctx.moveTo(bx - hw2, by + h);
        ctx.lineTo(bx - hw2, by + 14);
        ctx.lineTo(bx - hw2 * 0.35, by + 10);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + hw2 * 0.35, by + 10);
        ctx.lineTo(bx + hw2, by + 14);
        ctx.lineTo(bx + hw2, by + h);
        ctx.closePath();
        break;
      case "stepped":
        ctx.moveTo(bx - hw2, by + h);
        ctx.lineTo(bx - hw2, by + h * 0.55);
        ctx.lineTo(bx - hw2 * 0.6, by + h * 0.55);
        ctx.lineTo(bx - hw2 * 0.6, by + h * 0.28);
        ctx.lineTo(bx - hw2 * 0.25, by + h * 0.28);
        ctx.lineTo(bx - hw2 * 0.25, by);
        ctx.lineTo(bx + hw2 * 0.25, by);
        ctx.lineTo(bx + hw2 * 0.25, by + h * 0.28);
        ctx.lineTo(bx + hw2 * 0.6, by + h * 0.28);
        ctx.lineTo(bx + hw2 * 0.6, by + h * 0.55);
        ctx.lineTo(bx + hw2, by + h * 0.55);
        ctx.lineTo(bx + hw2, by + h);
        ctx.closePath();
        break;
      case "cylinder":
        ctx.moveTo(bx - hw2, by + h);
        ctx.lineTo(bx - hw2, by + 7);
        ctx.ellipse(bx, by + 7, hw2, 7, 0, Math.PI, 0);
        ctx.lineTo(bx + hw2, by + h);
        ctx.closePath();
        break;
      default:
        ctx.rect(bx - hw2, by, w, h);
        break;
    }
  }

  const flickerRate = critical ? 80 : exposed ? 120 : 200;
  const flickering = (damaged || exposed) && Math.sin(now / flickerRate) > 0;

  for (const b of backBuildings) {
    const bx = boat.x + b.ox;
    const by = topY - b.h + 4;
    const bldGrad = ctx.createLinearGradient(bx - b.w / 2, by, bx + b.w / 2, by + b.h);
    if (exposed) {
      bldGrad.addColorStop(0, critical ? "rgba(20,8,8,0.7)" : "rgba(10,18,28,0.7)");
      bldGrad.addColorStop(1, critical ? "rgba(15,4,4,0.75)" : "rgba(8,14,22,0.75)");
    } else {
      bldGrad.addColorStop(0, "rgba(18,45,60,0.6)");
      bldGrad.addColorStop(1, "rgba(10,30,45,0.7)");
    }
    traceBldShape(bx, by, b.w, b.h - 4, b.s);
    ctx.fillStyle = bldGrad;
    ctx.fill();
    ctx.save();
    traceBldShape(bx, by, b.w, b.h - 4, b.s);
    ctx.clip();
    ctx.fillStyle = exposed ? "rgba(120,40,10,0.3)" : "rgba(60,160,140,0.25)";
    let winSeed = b.ox * 1000 + 7;
    for (let wy = by + 5; wy < topY - 2; wy += 7) {
      for (let wx = bx - b.w / 2 + 4; wx < bx + b.w / 2 - 2; wx += 5) {
        winSeed++;
        if (seededRandH(winSeed) > 0.5) ctx.fillRect(wx, wy, 2, 2);
      }
    }
    ctx.restore();
  }

  for (const b of buildings) {
    const bx = boat.x + b.ox;
    const by = topY - b.h;
    const bldGrad = ctx.createLinearGradient(bx - b.w / 2, by, bx + b.w / 2, by + b.h);
    if (exposed) {
      bldGrad.addColorStop(0, critical ? "rgba(30,10,10,0.9)" : "rgba(15,25,35,0.9)");
      bldGrad.addColorStop(1, critical ? "rgba(20,5,5,0.95)" : "rgba(10,18,28,0.95)");
    } else {
      bldGrad.addColorStop(0, "rgba(30,70,90,0.8)");
      bldGrad.addColorStop(0.5, "rgba(20,50,70,0.85)");
      bldGrad.addColorStop(1, "rgba(15,35,55,0.9)");
    }
    traceBldShape(bx, by, b.w, b.h, b.s);
    ctx.fillStyle = bldGrad;
    ctx.fill();
    ctx.save();
    traceBldShape(bx, by, b.w, b.h, b.s);
    ctx.clip();
    ctx.fillStyle = exposed ? "rgba(40,60,80,0.3)" : "rgba(120,220,210,0.15)";
    ctx.fillRect(bx - b.w / 2, by, 3, b.h);
    if (b.s === "rect" || b.s === "stepped") {
      ctx.fillStyle = exposed ? "rgba(60,40,30,0.3)" : "rgba(150,240,230,0.12)";
      ctx.fillRect(bx - b.w / 2, by, b.w, 2);
    }
    if (exposed) {
      ctx.fillStyle = "rgba(60,30,10,0.3)";
      const scarCount = Math.ceil((1 - hpRatio) * 3);
      for (let si = 0; si < scarCount; si++) {
        const sy = by + (b.h * (si + 1)) / (scarCount + 1);
        ctx.fillRect(bx - b.w / 2, sy - 1, b.w, 2);
      }
    }
    ctx.restore();
    if (b.s === "spire") {
      ctx.strokeStyle = exposed ? "rgba(255,80,40,0.4)" : "rgba(120,240,220,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, by - 6, 2, 0, Math.PI * 2);
      ctx.fillStyle = exposed ? "rgba(255,60,30,0.6)" : "rgba(80,255,220,0.5)";
      ctx.fill();
    } else if (b.s === "dome" || b.s === "cylinder") {
      ctx.strokeStyle = exposed ? "rgba(200,60,30,0.2)" : "rgba(100,200,190,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (b.s === "dome") ctx.arc(bx, by + 10, b.w / 2, Math.PI, 0);
      else ctx.ellipse(bx, by + 7, b.w / 2, 7, 0, Math.PI, 0);
      ctx.stroke();
    }
    ctx.save();
    traceBldShape(bx, by, b.w, b.h, b.s);
    ctx.clip();
    const lightChance = exposed ? 0.9 : critical ? 0.85 : damaged ? 0.55 : 0.3;
    const lightColor = exposed
      ? flickering
        ? "#cc4400"
        : "#220800"
      : critical
        ? flickering
          ? "#aa3030"
          : "#331818"
        : damaged
          ? "#4ab8c0"
          : "#80e8d8";
    ctx.fillStyle = lightColor;
    const winStartY = by + (b.s === "spire" ? 16 : b.s === "dome" || b.s === "cylinder" ? 12 : 6);
    let winSeed2 = b.ox * 2000 + 13;
    for (let wy = winStartY; wy < topY - 4; wy += 8) {
      for (let wx = bx - b.w / 2 + 6; wx < bx + b.w / 2 - 3; wx += 6) {
        winSeed2++;
        if (seededRandH(winSeed2) > lightChance) ctx.fillRect(wx, wy, 2, 2);
      }
    }
    ctx.restore();
  }

  // Statue
  const sx = boat.x + hw - 60;
  const statueH = 120;
  const baseY2 = topY;
  const bodyColor = exposed ? "rgba(55,30,20,0.95)" : "rgba(35,80,90,0.95)";
  const bodyColorDark = exposed ? "rgba(40,20,12,0.95)" : "rgba(25,60,70,0.95)";
  const accentColor = exposed ? "rgba(80,40,25,0.9)" : "rgba(60,140,150,0.9)";
  ctx.fillStyle = exposed ? "rgba(40,25,20,0.9)" : "rgba(25,60,75,0.9)";
  ctx.fillRect(sx - 12, baseY2 - 6, 24, 6);
  ctx.fillRect(sx - 10, baseY2 - 12, 20, 6);
  ctx.fillRect(sx - 7, baseY2 - 18, 14, 6);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(sx - 2, baseY2 - 90, 4, 5);
  ctx.beginPath();
  ctx.ellipse(sx, baseY2 - 95, 5, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(sx, baseY2 - 99, 5, 3, 0, Math.PI, 0);
  ctx.fillStyle = bodyColorDark;
  ctx.fill();
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx - 8, baseY2 - 82);
  ctx.quadraticCurveTo(sx - 16, baseY2 - 75, sx - 14, baseY2 - 65);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx - 14, baseY2 - 64, 2, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx + 8, baseY2 - 82);
  ctx.quadraticCurveTo(sx + 14, baseY2 - 90, sx + 12, baseY2 - 100);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx + 12, baseY2 - 100, 2, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx + 12, baseY2 - 65);
  ctx.lineTo(sx + 12, baseY2 - statueH - 15);
  ctx.stroke();
  const statueTop = baseY2 - statueH;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(sx + 12, statueTop - 15);
  ctx.lineTo(sx + 12, statueTop - 28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx + 12, statueTop - 15);
  ctx.quadraticCurveTo(sx + 8, statueTop - 22, sx + 7, statueTop - 26);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx + 12, statueTop - 15);
  ctx.quadraticCurveTo(sx + 16, statueTop - 22, sx + 17, statueTop - 26);
  ctx.stroke();
  for (const tipX of [sx + 7, sx + 12, sx + 17]) {
    ctx.beginPath();
    ctx.arc(tipX, tipX === sx + 12 ? statueTop - 28 : statueTop - 26, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(sx + 8, statueTop - 15);
  ctx.lineTo(sx + 16, statueTop - 15);
  ctx.stroke();
  const glowPulse = 0.5 + Math.sin(now / 400) * 0.25;
  ctx.beginPath();
  ctx.arc(sx + 12, statueTop - 28, 5, 0, Math.PI * 2);
  ctx.fillStyle = exposed ? `rgba(255,100,40,${glowPulse * 0.4})` : `rgba(80,255,220,${glowPulse * 0.4})`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + 12, statueTop - 28, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = exposed ? `rgba(255,140,60,${glowPulse})` : `rgba(120,255,230,${glowPulse})`;
  ctx.fill();

  // SAM-7 structure
  const samX = boat.x - hw + 65;
  const samAlive = structHp > 0;
  if (samAlive) {
    // Launcher base
    ctx.fillStyle = exposed ? "#2a1a0a" : "#1a3040";
    ctx.fillRect(samX - 14, topY - 8, 28, 8);
    ctx.fillStyle = exposed ? "#3a2010" : "#2a4858";
    ctx.fillRect(samX - 10, topY - 14, 20, 8);
    // Rotating turret
    const turretAngle = Math.sin(now * 0.0005) * 0.4 - 0.6;
    ctx.save();
    ctx.translate(samX, topY - 14);
    ctx.rotate(turretAngle);
    // Tubes
    for (let t = -1; t <= 1; t++) {
      ctx.fillStyle = exposed ? "#4a2010" : "#3a6070";
      ctx.fillRect(-3 + t * 5, -22, 5, 22);
      // Tip glow
      ctx.beginPath();
      ctx.arc(-0.5 + t * 5, -22, 2.5, 0, Math.PI * 2);
      const tPulse = 0.4 + Math.sin(now * 0.006 + t) * 0.3;
      ctx.fillStyle = exposed ? `rgba(255,80,40,${tPulse})` : `rgba(80,200,240,${tPulse})`;
      ctx.fill();
    }
    ctx.restore();
  } else {
    // Destroyed SAM
    ctx.fillStyle = "#3a2010";
    ctx.fillRect(samX - 14, topY - 8, 28, 8);
    ctx.save();
    ctx.translate(samX, topY - 8);
    ctx.rotate(0.6);
    ctx.fillStyle = "#2a1808";
    ctx.fillRect(-5, -18, 8, 18);
    ctx.restore();
  }

  if (exposed) {
    ctx.globalAlpha = 0.3 + Math.sin(now / 200) * 0.1;
    for (let i = 0; i < 5; i++) {
      const smokeX = boat.x + Math.sin(now / 800 + i * 1.3) * hw * 0.5;
      const smokeY = topY - 20 - ((now / 50 + i * 30) % 60);
      const smokeR = 6 + Math.sin(now / 300 + i) * 3;
      ctx.beginPath();
      ctx.arc(smokeX, smokeY, smokeR, 0, Math.PI * 2);
      ctx.fillStyle = critical ? "rgba(200,60,20,0.3)" : "rgba(80,80,80,0.25)";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawDomeBarrier(ctx, boat, topY, hpRatio, barrierUp);
  ctx.restore();
}

function accentNeedle(exposed: boolean): string {
  return exposed ? "rgba(255,100,40,0.7)" : "rgba(60,220,240,0.7)";
}

// ==================== NOVA MARE ====================
// Research platform — sleek, modular, geodesic, solar panels, observation spire
// Structure: Shield Battery — hexagonal emitter tower

function drawNovaMare(
  ctx: CanvasRenderingContext2D,
  boat: Boat,
  viewH: number,
  hpRatio: number,
  barrierUp: boolean,
  structHp: number,
) {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  const topY = waveY - 22;
  const hw = boat.width / 2;
  const now = performance.now();
  const exposed = !barrierUp;
  const critical = hpRatio <= 0.3;
  const damaged = hpRatio < 1;
  const scale = boat.width / 700;

  ctx.save();
  drawPlatformBase(ctx, boat, topY, hpRatio, exposed);

  // ---- Colour palette ----
  const modDark = exposed ? "#1a0e0a" : "#0e1e2e";
  const modMid = exposed ? "#2a1810" : "#162838";
  const modLight = exposed ? "#3a2818" : "#1e3a50";
  const glass = exposed ? "rgba(180,60,20,0.15)" : "rgba(60,200,220,0.15)";
  const glowC = exposed ? "rgba(255,80,40,0.8)" : "rgba(60,220,240,0.8)";
  const panelC = exposed ? "#4a2010" : "#1a4060";

  // ---- Background modular blocks ----
  const backBlocks = [
    { ox: -250, w: 45, h: 22 },
    { ox: -195, w: 38, h: 30 },
    { ox: -148, w: 30, h: 38 },
    { ox: -108, w: 36, h: 28 },
    { ox: -62, w: 32, h: 42 },
    { ox: -22, w: 40, h: 36 },
    { ox: 24, w: 36, h: 44 },
    { ox: 68, w: 30, h: 32 },
    { ox: 108, w: 38, h: 26 },
    { ox: 156, w: 42, h: 34 },
    { ox: 206, w: 36, h: 28 },
  ].map((b) => ({ ...b, ox: b.ox * scale, w: b.w * scale, h: b.h * scale }));

  for (const b of backBlocks) {
    const bx = boat.x + b.ox;
    const by = topY - b.h;
    ctx.fillStyle = modMid;
    ctx.fillRect(bx - b.w / 2, by, b.w, b.h);
    // Hex window
    const hexR = 5 * scale;
    const hx = bx,
      hy = by + b.h * 0.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      if (i === 0) ctx.moveTo(hx + Math.cos(a) * hexR, hy + Math.sin(a) * hexR);
      else ctx.lineTo(hx + Math.cos(a) * hexR, hy + Math.sin(a) * hexR);
    }
    ctx.closePath();
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = exposed ? "rgba(180,60,20,0.4)" : "rgba(60,200,220,0.4)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // ---- Foreground modules / geodesic structures ----
  type ModDef = { ox: number; w: number; h: number; type: "geo" | "cylinder" | "block" | "sphere" };
  const modules: ModDef[] = (
    [
      { ox: -245, w: 28, h: 35, type: "block" },
      { ox: -205, w: 40, h: 55, type: "geo" },
      { ox: -155, w: 32, h: 48, type: "cylinder" },
      { ox: -110, w: 36, h: 62, type: "geo" },
      { ox: -62, w: 28, h: 52, type: "sphere" },
      { ox: -25, w: 32, h: 70, type: "block" },
      { ox: 18, w: 38, h: 80, type: "geo" },
      { ox: 65, w: 28, h: 65, type: "cylinder" },
      { ox: 102, w: 36, h: 55, type: "geo" },
      { ox: 148, w: 30, h: 45, type: "sphere" },
      { ox: 188, w: 34, h: 38, type: "block" },
      { ox: 230, w: 28, h: 30, type: "cylinder" },
    ] as const
  ).map((b) => ({ ...b, ox: b.ox * scale, w: b.w * scale, h: b.h * scale }));

  for (const m of modules) {
    const mx = boat.x + m.ox;
    const my = topY - m.h;
    if (m.type === "geo") {
      // Geodesic dome on block base
      const baseH = m.h * 0.45;
      ctx.fillStyle = modMid;
      ctx.fillRect(mx - m.w / 2, my + m.h - baseH, m.w, baseH);
      // Dome
      ctx.beginPath();
      ctx.arc(mx, my + m.h - baseH, m.w / 2, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = modLight;
      ctx.fill();
      ctx.strokeStyle = exposed ? "rgba(180,60,20,0.3)" : "rgba(60,200,220,0.3)";
      ctx.lineWidth = 0.5;
      // Geodesic lines
      const dr = m.w / 2;
      for (let li = 0; li < 5; li++) {
        const la = Math.PI + (li / 4) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(mx, my + m.h - baseH);
        ctx.lineTo(mx + Math.cos(la) * dr, my + m.h - baseH + Math.sin(la) * dr);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(mx, my + m.h - baseH, dr * 0.5, Math.PI, 0);
      ctx.stroke();
      // Glass panels
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.arc(mx, my + m.h - baseH, dr, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    } else if (m.type === "cylinder") {
      ctx.fillStyle = modMid;
      ctx.fillRect(mx - m.w / 2, my, m.w, m.h);
      // Ellipse cap
      ctx.beginPath();
      ctx.ellipse(mx, my, m.w / 2, m.w * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = modLight;
      ctx.fill();
      ctx.strokeStyle = exposed ? "rgba(180,60,20,0.3)" : "rgba(60,200,220,0.3)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Horizontal rings
      for (let ri = 1; ri <= 3; ri++) {
        ctx.beginPath();
        ctx.ellipse(mx, my + (m.h * ri) / 4, m.w / 2, m.w * 0.08, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (m.type === "sphere") {
      ctx.fillStyle = modMid;
      ctx.fillRect(mx - m.w / 4, my + m.h - m.w * 0.6, m.w / 2, m.w * 0.6);
      ctx.beginPath();
      ctx.arc(mx, my + m.h - m.w * 0.5, m.w / 2, 0, Math.PI * 2);
      ctx.fillStyle = modLight;
      ctx.fill();
      ctx.strokeStyle = exposed ? "rgba(180,60,20,0.3)" : "rgba(60,200,220,0.3)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(mx, my + m.h - m.w * 0.5, m.w / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(mx, my + m.h - m.w * 0.5, m.w / 2, m.w * 0.1, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.arc(mx, my + m.h - m.w * 0.5, m.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = modMid;
      ctx.fillRect(mx - m.w / 2, my, m.w, m.h);
      ctx.fillStyle = modLight;
      ctx.fillRect(mx - m.w / 2, my, m.w, 3 * scale);
    }

    // Glowing window strips on all types
    const winRows = Math.max(1, Math.floor(m.h / (16 * scale)));
    ctx.fillStyle = glowC;
    ctx.globalAlpha = 0.4;
    for (let wr = 0; wr < winRows; wr++) {
      if (seededRand(m.ox * 100 + wr) > 0.5) continue;
      const wy = my + 4 * scale + wr * 16 * scale;
      ctx.fillRect(mx - m.w * 0.35, wy, m.w * 0.7, 2 * scale);
    }
    ctx.globalAlpha = 1;
  }

  // ---- Solar panel arrays ----
  const panelArrays = [
    { ox: -180 * scale, count: 5 },
    { ox: 80 * scale, count: 4 },
  ];
  for (const pa of panelArrays) {
    const px = boat.x + pa.ox;
    const pw = 14 * scale,
      ph = 8 * scale,
      gap = 3 * scale;
    const tiltAngle = Math.sin(now * 0.0002) * 0.08 + 0.15;
    // Support post
    ctx.strokeStyle = exposed ? "#4a2010" : "#2a5060";
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(px, topY);
    ctx.lineTo(px, topY - 28 * scale);
    ctx.stroke();
    ctx.save();
    ctx.translate(px, topY - 28 * scale);
    ctx.rotate(-tiltAngle);
    for (let pi = 0; pi < pa.count; pi++) {
      const ox2 = (pi - (pa.count - 1) / 2) * (pw + gap);
      ctx.fillStyle = exposed ? "#2a1808" : "#0a2a40";
      ctx.fillRect(ox2 - pw / 2, -ph / 2, pw, ph);
      ctx.strokeStyle = exposed ? "rgba(180,60,20,0.3)" : "rgba(60,200,220,0.3)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(ox2 - pw / 2, -ph / 2, pw, ph);
      // Panel grid lines
      ctx.beginPath();
      ctx.moveTo(ox2, -ph / 2);
      ctx.lineTo(ox2, ph / 2);
      ctx.moveTo(ox2 - pw / 2, 0);
      ctx.lineTo(ox2 + pw / 2, 0);
      ctx.stroke();
      // Reflection glint
      if (!exposed) {
        ctx.fillStyle = "rgba(100,220,240,0.15)";
        ctx.fillRect(ox2 - pw / 2 + 1, -ph / 2 + 1, pw / 2, ph / 2);
      }
    }
    ctx.restore();
  }

  // ---- Shield Battery Structure ----
  const shieldX = boat.x + hw * 0.4;
  const shieldBaseY = topY;
  const shieldAlive = structHp > 0;
  const towerH = 75 * scale;

  if (shieldAlive) {
    // Tower shaft
    ctx.strokeStyle = exposed ? "#5a2010" : "#2a6070";
    ctx.lineWidth = 5 * scale;
    ctx.beginPath();
    ctx.moveTo(shieldX, shieldBaseY);
    ctx.lineTo(shieldX, shieldBaseY - towerH);
    ctx.stroke();
    // Struts
    ctx.lineWidth = 2 * scale;
    for (let st = 1; st <= 3; st++) {
      const sy = shieldBaseY - (towerH * st) / 4;
      const spread = 10 * scale * (1 - st / 4);
      ctx.beginPath();
      ctx.moveTo(shieldX - spread, sy);
      ctx.lineTo(shieldX + spread, sy);
      ctx.stroke();
    }
    // Hexagonal emitter at top
    const emitY = shieldBaseY - towerH;
    const emitR = 18 * scale;
    const rotAngle = (now * 0.0006) % ((Math.PI * 2) / 6); // rotates by 1/6 turns
    ctx.save();
    ctx.translate(shieldX, emitY);
    // Outer hex ring
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rotAngle;
      if (i === 0) ctx.moveTo(Math.cos(a) * emitR, Math.sin(a) * emitR);
      else ctx.lineTo(Math.cos(a) * emitR, Math.sin(a) * emitR);
    }
    ctx.closePath();
    ctx.fillStyle = exposed ? "#2a0a08" : "#0a2a40";
    ctx.fill();
    ctx.strokeStyle = exposed ? "rgba(255,80,40,0.6)" : "rgba(60,220,240,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Inner hex
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rotAngle;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * emitR * 0.7, Math.sin(a) * emitR * 0.7);
      ctx.strokeStyle = exposed ? "rgba(255,80,40,0.25)" : "rgba(60,220,240,0.25)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    // Core glow
    const pulse = 0.6 + Math.sin(now * 0.005) * 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, emitR * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = exposed ? `rgba(255,100,40,${pulse})` : `rgba(60,220,240,${pulse})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, emitR * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    // Shield pulse rings when active
    if (!exposed) {
      for (let ring = 1; ring <= 2; ring++) {
        const rp = (now * 0.0008 + ring * 0.5) % 1;
        ctx.beginPath();
        ctx.arc(0, 0, emitR * (1 + rp * 2), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(60,220,240,${0.3 * (1 - rp)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  } else {
    // Destroyed — bent tower stub
    ctx.save();
    ctx.translate(shieldX, shieldBaseY);
    ctx.rotate(-0.4);
    ctx.strokeStyle = "#4a2010";
    ctx.lineWidth = 5 * scale;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -towerH * 0.45);
    ctx.stroke();
    ctx.restore();
    // Debris hex pieces
    ctx.strokeStyle = "rgba(60,80,100,0.4)";
    ctx.lineWidth = 1;
    for (let di = 0; di < 3; di++) {
      const dx = shieldX + (di - 1) * 14 * scale;
      const dy = shieldBaseY - 5 * scale;
      ctx.beginPath();
      ctx.arc(dx, dy, 6 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Damage smoke
  if (exposed) {
    ctx.globalAlpha = 0.3 + Math.sin(now / 200) * 0.1;
    for (let i = 0; i < 5; i++) {
      const smokeX = boat.x + Math.sin(now / 800 + i * 1.3) * hw * 0.5;
      const smokeY = topY - 20 - ((now / 50 + i * 30) % 60);
      ctx.beginPath();
      ctx.arc(smokeX, smokeY, 6 + Math.sin(now / 300 + i) * 3, 0, Math.PI * 2);
      ctx.fillStyle = critical ? "rgba(200,60,20,0.3)" : "rgba(80,80,80,0.25)";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawDomeBarrier(ctx, boat, topY, hpRatio, barrierUp);
  ctx.restore();
}

// ==================== MAIN DRAW DISPATCHER ====================

export function drawBoat(
  ctx: CanvasRenderingContext2D,
  boat: Boat,
  viewH: number,
  hpRatio: number = 1,
  barrierUp: boolean = true,
  structHp: number = 3,
) {
  if (boat.name === "PORT ASTRA") {
    drawPortAstra(ctx, boat, viewH, hpRatio, barrierUp, structHp);
  } else if (boat.name === "NOVA MARE") {
    drawNovaMare(ctx, boat, viewH, hpRatio, barrierUp, structHp);
  } else {
    drawHaven(ctx, boat, viewH, hpRatio, barrierUp, structHp);
  }
}

// ==================== COLLISION ====================

export function collideWithBoat(
  px: number,
  py: number,
  radius: number,
  boat: Boat,
  viewH: number,
): { x: number; y: number; damaging: boolean } | null {
  const topY = getBoatTopY(boat, viewH);
  const hw = boat.width / 2;
  const hd = boat.hullDepth;

  if (px < boat.x - hw - radius || px > boat.x + hw + radius) return null;
  if (py < topY - radius - 40) return null;
  if (py > topY + hd + radius) return null;

  const inX = px > boat.x - hw + 10 && px < boat.x + hw - 10;
  if (inX && py > topY - radius && py < topY + 5) {
    return { x: px, y: topY - radius - 1, damaging: true };
  }
  if (inX && py > topY + 5 && py < topY + hd + radius) {
    return { x: px, y: topY + hd + radius + 1, damaging: false };
  }
  return null;
}

export function createBoat(worldWidth: number): Boat {
  return {
    x: worldWidth / 2,
    width: 700,
    hullDepth: 36,
    name: "HAVEN",
  };
}
