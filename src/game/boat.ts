/**
 * boat.ts — Floating City (the thing you're defending!)
 *
 * Now supports multiple named cities spread across the world.
 */

import { getWaveY, getWaterSurfaceY } from "./water";

export interface Boat {
  x: number;
  width: number;
  hullDepth: number;
  name: string;
}

export function createBoat(worldWidth: number): Boat {
  return {
    x: worldWidth / 2,
    width: 700,
    hullDepth: 36,
    name: "HAVEN",
  };
}

/**
 * Create all three cities spread across the world.
 * Left city, Center city, Right city.
 * Haven is wider to accommodate the SAM site on the left.
 */
export function createCities(worldWidth: number): Boat[] {
  return [
    { x: Math.floor(worldWidth * 0.17), width: 580, hullDepth: 36, name: "PORT ASTRA" },
    { x: Math.floor(worldWidth * 0.5), width: 960, hullDepth: 36, name: "HAVEN" },
    { x: Math.floor(worldWidth * 0.83), width: 580, hullDepth: 36, name: "NOVA MARE" },
  ];
}

export function getBoatTopY(boat: Boat, viewH: number): number {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  return waveY - 22;
}

/**
 * Draw a SAM (Surface-to-Air Missile) site on the left side of Haven.
 * Industrial-alien aesthetic matching the rest of the game.
 * Consists of: a reinforced bunker base, rotating radar dish, and two missile tubes.
 */
function drawSAMSite(ctx: CanvasRenderingContext2D, cityX: number, hw: number, topY: number, now: number) {
  // hw * 0.85 = barrier radius. Place SAM clearly outside: cityX - hw + 50 puts it ~430px
  // from center when hw=480, well beyond the ~408px barrier radius.
  const sx = cityX - hw + 55;
  const baseY = topY;

  ctx.save();

  // ---- Bunker base ----
  const bunkerW = 70;
  const bunkerH = 22;
  const bunkerX = sx - bunkerW / 2;
  const bunkerTop = baseY - bunkerH;

  ctx.beginPath();
  ctx.moveTo(bunkerX + 6, bunkerTop);
  ctx.lineTo(bunkerX + bunkerW - 6, bunkerTop);
  ctx.lineTo(bunkerX + bunkerW, bunkerTop + 8);
  ctx.lineTo(bunkerX + bunkerW, baseY);
  ctx.lineTo(bunkerX, baseY);
  ctx.lineTo(bunkerX, bunkerTop + 8);
  ctx.closePath();
  const bunkerGrad = ctx.createLinearGradient(bunkerX, bunkerTop, bunkerX, baseY);
  bunkerGrad.addColorStop(0, "#2a3040");
  bunkerGrad.addColorStop(0.5, "#1a2030");
  bunkerGrad.addColorStop(1, "#0f1520");
  ctx.fillStyle = bunkerGrad;
  ctx.fill();
  ctx.strokeStyle = "#3a4a5a";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Bunker panel lines
  ctx.strokeStyle = "rgba(80, 140, 160, 0.2)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(bunkerX + 16, bunkerTop + 4);
  ctx.lineTo(bunkerX + 16, baseY);
  ctx.moveTo(bunkerX + bunkerW - 16, bunkerTop + 4);
  ctx.lineTo(bunkerX + bunkerW - 16, baseY);
  ctx.stroke();

  // Bunker warning stripe
  ctx.fillStyle = "rgba(200, 60, 30, 0.35)";
  ctx.fillRect(bunkerX + 4, bunkerTop + 10, bunkerW - 8, 4);

  // ---- Reinforced platform collar ----
  ctx.beginPath();
  ctx.moveTo(bunkerX - 6, baseY);
  ctx.lineTo(bunkerX + bunkerW + 6, baseY);
  ctx.lineTo(bunkerX + bunkerW + 4, baseY - 5);
  ctx.lineTo(bunkerX - 4, baseY - 5);
  ctx.closePath();
  ctx.fillStyle = "#222a35";
  ctx.fill();
  ctx.strokeStyle = "#445566";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // ---- Static antenna mast (replaces rotating dish) ----
  // Mast base sits on bunker top and is drawn as part of the bunker visually.
  // A cross-brace connects it to the bunker body so there's no floating gap.
  const antennaX = sx + 14; // right side of bunker top
  const antennaBaseY = bunkerTop; // flush with bunker top surface

  // Cross-brace from bunker body up to antenna base — eliminates any gap
  ctx.beginPath();
  ctx.moveTo(antennaX - 10, antennaBaseY);
  ctx.lineTo(antennaX, antennaBaseY - 6);
  ctx.lineTo(antennaX + 4, antennaBaseY);
  ctx.closePath();
  ctx.fillStyle = "#2a3a4a";
  ctx.fill();
  ctx.strokeStyle = "#445566";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Antenna base collar — sits flush on bunker top
  ctx.beginPath();
  ctx.roundRect(antennaX - 5, antennaBaseY - 5, 10, 6, 1);
  ctx.fillStyle = "#334455";
  ctx.fill();
  ctx.strokeStyle = "#445566";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Main mast shaft
  ctx.beginPath();
  ctx.moveTo(antennaX - 2, antennaBaseY - 4);
  ctx.lineTo(antennaX - 2, antennaBaseY - 28);
  ctx.lineTo(antennaX + 2, antennaBaseY - 28);
  ctx.lineTo(antennaX + 2, antennaBaseY - 4);
  ctx.closePath();
  ctx.fillStyle = "#334455";
  ctx.fill();

  // Mid brace ring
  ctx.beginPath();
  ctx.roundRect(antennaX - 4, antennaBaseY - 18, 8, 3, 1);
  ctx.fillStyle = "#2a3a4a";
  ctx.fill();
  ctx.strokeStyle = "#445566";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Horizontal crossbar at top
  ctx.beginPath();
  ctx.moveTo(antennaX - 10, antennaBaseY - 28);
  ctx.lineTo(antennaX + 10, antennaBaseY - 28);
  ctx.strokeStyle = "#445566";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Short vertical nubs on crossbar ends
  ctx.beginPath();
  ctx.moveTo(antennaX - 10, antennaBaseY - 28);
  ctx.lineTo(antennaX - 10, antennaBaseY - 33);
  ctx.moveTo(antennaX + 10, antennaBaseY - 28);
  ctx.lineTo(antennaX + 10, antennaBaseY - 33);
  ctx.strokeStyle = "#556677";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tip spike
  ctx.beginPath();
  ctx.moveTo(antennaX, antennaBaseY - 28);
  ctx.lineTo(antennaX, antennaBaseY - 36);
  ctx.strokeStyle = "#667788";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Blinking tip light
  const blinkPulse = Math.sin(now * 0.006) > 0.2;
  ctx.beginPath();
  ctx.arc(antennaX, antennaBaseY - 36, 2, 0, Math.PI * 2);
  ctx.fillStyle = blinkPulse ? "rgba(255, 80, 60, 0.95)" : "rgba(120, 30, 20, 0.5)";
  ctx.fill();

  // ---- Single missile tube (left side, angled outward) ----
  // Tube extends well into the bunker body (positive tubeOverlap) so
  // the base is visually buried in the structure — no floating gap.
  const tubeLen = 38;
  const tubeOverlap = 10; // how many px the tube base sinks into the bunker
  const tx = sx - 8;
  const ty = bunkerTop + tubeOverlap; // sink base down into bunker top
  const angle = -0.62; // angled left-upward

  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(angle);

  // Tube outer shell — base at y=+tubeOverlap (inside bunker), tip at y=-(tubeLen)
  ctx.beginPath();
  ctx.roundRect(-5, -tubeLen, 10, tubeLen + tubeOverlap, 2);
  ctx.fillStyle = "#1e2a38";
  ctx.fill();
  ctx.strokeStyle = "#3a4a5a";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tube inner barrel
  ctx.beginPath();
  ctx.roundRect(-3, -tubeLen + 2, 6, tubeLen - 2, 1);
  ctx.fillStyle = "#0f1820";
  ctx.fill();

  // Missile tip
  ctx.beginPath();
  ctx.moveTo(0, -tubeLen + 2);
  ctx.lineTo(-2.5, -tubeLen + 9);
  ctx.lineTo(2.5, -tubeLen + 9);
  ctx.closePath();
  ctx.fillStyle = "#cc3322";
  ctx.fill();

  // Band rings along tube
  for (const bandY of [-tubeLen + 11, -tubeLen + 22, -10]) {
    ctx.beginPath();
    ctx.roundRect(-6, bandY, 12, 3, 1);
    ctx.fillStyle = "#2a3a4a";
    ctx.fill();
    ctx.strokeStyle = "#445566";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Warhead glow
  const missilePulse = 0.4 + Math.sin(now * 0.005) * 0.3;
  ctx.beginPath();
  ctx.arc(0, -tubeLen + 4, 3, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 60, 30, ${missilePulse * 0.6})`;
  ctx.fill();

  ctx.restore();

  // ---- Status light on bunker front ----
  const statusPulse = 0.6 + Math.sin(now * 0.003) * 0.4;
  ctx.beginPath();
  ctx.arc(sx, bunkerTop + 6, 3, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(80, 220, 100, ${statusPulse})`;
  ctx.fill();
  // Status light halo
  ctx.beginPath();
  ctx.arc(sx, bunkerTop + 6, 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(80, 220, 100, ${statusPulse * 0.2})`;
  ctx.fill();

  // ---- "SAM" label ----
  ctx.font = "bold 7px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(100, 200, 180, 0.6)";
  ctx.fillText("SAM-7", sx, baseY - bunkerH - 32);

  ctx.restore();
}

export function drawBoat(
  ctx: CanvasRenderingContext2D,
  boat: Boat,
  viewH: number,
  hpRatio: number = 1,
  barrierUp: boolean = true,
) {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  const topY = waveY - 22;

  const hw = boat.width / 2;
  const hd = boat.hullDepth;

  ctx.save();

  // --- Platform base ---
  ctx.beginPath();
  const baseR = 20;
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
  baseGrad.addColorStop(0, "rgba(20, 60, 80, 0.9)");
  baseGrad.addColorStop(0.5, "rgba(10, 40, 60, 0.95)");
  baseGrad.addColorStop(1, "rgba(5, 25, 45, 0.95)");
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // --- Platform surface highlight ---
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + baseR, topY);
  ctx.lineTo(boat.x + hw - baseR, topY);
  ctx.quadraticCurveTo(boat.x + hw, topY, boat.x + hw - 5, topY + 5);
  ctx.lineTo(boat.x - hw + 5, topY + 5);
  ctx.quadraticCurveTo(boat.x - hw, topY, boat.x - hw + baseR, topY);
  ctx.closePath();
  ctx.fillStyle = "rgba(100, 220, 210, 0.25)";
  ctx.fill();

  // --- Hull lines ---
  ctx.strokeStyle = "rgba(80, 200, 190, 0.15)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const ly = topY + (hd * i) / 4;
    const shrink = i * 6;
    ctx.beginPath();
    ctx.moveTo(boat.x - hw + 10 + shrink, ly);
    ctx.lineTo(boat.x + hw - 10 - shrink, ly);
    ctx.stroke();
  }

  // --- City name label ---
  ctx.save();
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(100,220,210,0.85)";
  ctx.fillText(boat.name, boat.x, topY + hd - 6);
  ctx.restore();

  // Seeded random for windows
  const seededRand = (seed: number) => {
    let s = seed | 0;
    s = ((s >>> 16) ^ s) * 0x45d9f3b;
    s = ((s >>> 16) ^ s) * 0x45d9f3b;
    s = (s >>> 16) ^ s;
    return (s & 0xffff) / 0xffff;
  };

  type BldStyle = "rect" | "dome" | "spire" | "stepped" | "cylinder";
  type BldDef = { ox: number; w: number; h: number; s: BldStyle };

  // Scale buildings relative to city width
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

  const damaged = hpRatio < 1;
  const critical = hpRatio <= 0.3;
  const exposed = !barrierUp;
  const now = performance.now();
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
        if (seededRand(winSeed) > 0.5) ctx.fillRect(wx, wy, 2, 2);
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
        if (seededRand(winSeed2) > lightChance) ctx.fillRect(wx, wy, 2, 2);
      }
    }
    ctx.restore();
  }

  // Statue (only on the largest / center city — Haven)
  if (boat.width >= 700) {
    const sx = boat.x + hw - 60;
    const statueH = 120;
    const baseY2 = topY;

    ctx.fillStyle = exposed ? "rgba(40,25,20,0.9)" : "rgba(25,60,75,0.9)";
    ctx.fillRect(sx - 12, baseY2 - 6, 24, 6);
    ctx.fillRect(sx - 10, baseY2 - 12, 20, 6);
    ctx.fillRect(sx - 7, baseY2 - 18, 14, 6);

    const bodyColor = exposed ? "rgba(55,30,20,0.95)" : "rgba(35,80,90,0.95)";
    const bodyColorDark = exposed ? "rgba(40,20,12,0.95)" : "rgba(25,60,70,0.95)";
    const accentColor = exposed ? "rgba(80,40,25,0.9)" : "rgba(60,140,150,0.9)";

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(sx - 5, baseY2 - 18);
    ctx.lineTo(sx - 6, baseY2 - 50);
    ctx.lineTo(sx - 2, baseY2 - 50);
    ctx.lineTo(sx - 1, baseY2 - 18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx + 1, baseY2 - 18);
    ctx.lineTo(sx + 2, baseY2 - 52);
    ctx.lineTo(sx + 6, baseY2 - 52);
    ctx.lineTo(sx + 5, baseY2 - 18);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx - 6, baseY2 - 50);
    ctx.lineTo(sx - 8, baseY2 - 65);
    ctx.quadraticCurveTo(sx - 10, baseY2 - 80, sx - 8, baseY2 - 85);
    ctx.lineTo(sx + 8, baseY2 - 85);
    ctx.quadraticCurveTo(sx + 10, baseY2 - 80, sx + 8, baseY2 - 65);
    ctx.lineTo(sx + 6, baseY2 - 50);
    ctx.closePath();
    const torsoGrad = ctx.createLinearGradient(sx - 8, baseY2 - 85, sx + 8, baseY2 - 50);
    torsoGrad.addColorStop(0, bodyColor);
    torsoGrad.addColorStop(1, bodyColorDark);
    ctx.fillStyle = torsoGrad;
    ctx.fill();

    ctx.fillStyle = accentColor;
    ctx.fillRect(sx - 7, baseY2 - 52, 14, 3);
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

    ctx.beginPath();
    ctx.moveTo(sx - 8, baseY2 - 84);
    ctx.quadraticCurveTo(sx - 12, baseY2 - 70, sx - 10, baseY2 - 50);
    ctx.quadraticCurveTo(sx - 14, baseY2 - 40, sx - 11, baseY2 - 30);
    ctx.lineTo(sx - 6, baseY2 - 50);
    ctx.closePath();
    ctx.fillStyle = exposed ? "rgba(50,25,15,0.6)" : "rgba(30,70,80,0.5)";
    ctx.fill();

    // ---- SAM site on left side of Haven ----
    drawSAMSite(ctx, boat.x, hw, topY, now);
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

  // ==================== DOME BARRIER ====================
  if (barrierUp) {
    const domeRadius = hw * 0.85;
    const domeCenterY = topY;

    const domeR = Math.round(30 + (1 - hpRatio) * 200);
    const domeG = Math.round(200 * hpRatio + 40);
    const domeB = Math.round(220 * hpRatio + 30);
    const domeAlphaBase = 0.1 + (1 - hpRatio) * 0.15;

    const domeGrad = ctx.createRadialGradient(boat.x, domeCenterY, domeRadius * 0.3, boat.x, domeCenterY, domeRadius);
    domeGrad.addColorStop(0, `rgba(${domeR},${domeG},${domeB},0.01)`);
    domeGrad.addColorStop(0.6, `rgba(${domeR},${domeG},${domeB},${domeAlphaBase * 0.4})`);
    domeGrad.addColorStop(0.85, `rgba(${domeR},${domeG},${domeB},${domeAlphaBase * 0.7})`);
    domeGrad.addColorStop(1, `rgba(${domeR},${domeG},${domeB},${domeAlphaBase})`);

    const specGrad = ctx.createRadialGradient(
      boat.x - domeRadius * 0.3,
      domeCenterY - domeRadius * 0.5,
      0,
      boat.x - domeRadius * 0.3,
      domeCenterY - domeRadius * 0.5,
      domeRadius * 0.4,
    );
    specGrad.addColorStop(0, "rgba(255,255,255,0.08)");
    specGrad.addColorStop(1, "rgba(255,255,255,0)");

    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = domeGrad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = specGrad;
    ctx.fill();

    const outlineAlpha = critical ? (flickering ? 0.6 : 0.15) : 0.25 + (1 - hpRatio) * 0.2;
    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.strokeStyle = `rgba(${domeR + 60},${Math.min(domeG + 40, 255)},${Math.min(domeB + 55, 255)},${outlineAlpha})`;
    ctx.lineWidth = damaged ? 3 : 2;
    ctx.stroke();

    if (!critical || flickering) {
      ctx.beginPath();
      ctx.arc(boat.x, domeCenterY, domeRadius * 0.92, Math.PI * 0.95, Math.PI * 0.05);
      ctx.strokeStyle = `rgba(${domeR + 80},${Math.min(domeG + 60, 255)},${Math.min(domeB + 55, 255)},0.15)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

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

    const hexAlpha = Math.max(0.02, 0.08 * hpRatio);
    ctx.strokeStyle = `rgba(${domeR},${Math.min(domeG + 40, 255)},${Math.min(domeB + 40, 255)},${hexAlpha})`;
    ctx.lineWidth = 0.5;
    for (let a = Math.PI; a < Math.PI * 2; a += 0.12) {
      for (let r = domeRadius * 0.3; r < domeRadius * 0.95; r += 35) {
        const hx = boat.x + Math.cos(a) * r;
        const hy = domeCenterY + Math.sin(a) * r;
        if (hy < domeCenterY) {
          ctx.beginPath();
          ctx.arc(hx, hy, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  } else {
    const domeRadius = hw * 0.85;
    const domeCenterY = topY;
    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.setLineDash([8, 12]);
    ctx.strokeStyle = "rgba(255,80,40,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const fx = boat.x - hw * 0.7 + i * hw * 0.28;
      const fy = topY - 2 + Math.sin(i * 2.1) * 3;
      ctx.beginPath();
      ctx.arc(fx, fy, 4 + (i % 3), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(100,160,200,0.15)";
      ctx.fill();
    }
  }

  // Waterline highlight
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + 10, topY + hd);
  ctx.lineTo(boat.x + hw - 10, topY + hd);
  ctx.strokeStyle = "rgba(100,160,200,0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

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
