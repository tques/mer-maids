// Water system: rendering, splash particles, and physics

export const WATER_RATIO = 0.25; // bottom 25% of canvas
export const WATER_SPEED_FACTOR = 0.45; // speed multiplier when submerged
export const WAVE_AMPLITUDE = 6;
export const WAVE_FREQUENCY = 0.02;
export const WAVE_SPEED = 0.002;

export interface Splash {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
}

export interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
}

let splashes: Splash[] = [];
let ripples: Ripple[] = [];
let waveTime = 0;

export function getWaterSurfaceY(canvasHeight: number): number {
  return canvasHeight * (1 - WATER_RATIO);
}

export function getWaveY(x: number, baseY: number): number {
  return baseY + Math.sin(x * WAVE_FREQUENCY + waveTime) * WAVE_AMPLITUDE
    + Math.sin(x * WAVE_FREQUENCY * 1.7 + waveTime * 1.3) * WAVE_AMPLITUDE * 0.5;
}

export function isSubmerged(py: number, canvasHeight: number): boolean {
  const surfaceY = getWaterSurfaceY(canvasHeight);
  return py > surfaceY;
}

export function spawnSplash(x: number, y: number, vy: number, entering: boolean) {
  const count = entering ? 12 : 18; // more particles on exit (dolphin leap)
  const baseSpeed = entering ? 3 : 5;
  for (let i = 0; i < count; i++) {
    const ang = entering
      ? -Math.PI * Math.random() // upward semicircle
      : -Math.PI * (0.15 + Math.random() * 0.7); // tighter upward arc on exit
    const speed = baseSpeed * (0.5 + Math.random());
    splashes.push({
      x,
      y,
      vx: Math.cos(ang) * speed + (Math.random() - 0.5) * 2,
      vy: Math.sin(ang) * speed * (entering ? 1 : 1.5),
      life: 1,
      maxLife: 0.4 + Math.random() * 0.3,
      radius: 2 + Math.random() * 3,
    });
  }
  // Ripple ring
  ripples.push({ x, y, radius: 4, maxRadius: 40 + Math.abs(vy) * 8, life: 1 });
}

export function updateParticles(dt: number) {
  waveTime += WAVE_SPEED * dt * 60;

  splashes = splashes.filter((s) => {
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.15; // gravity
    s.life -= dt / s.maxLife;
    return s.life > 0;
  });

  ripples = ripples.filter((r) => {
    r.life -= dt * 2.5;
    r.radius += (r.maxRadius - r.radius) * 0.08;
    return r.life > 0;
  });
}

export function drawWater(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  const baseY = getWaterSurfaceY(ch);

  // Draw water body with wave surface
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, ch);
  for (let x = 0; x <= cw; x += 4) {
    ctx.lineTo(x, getWaveY(x, baseY));
  }
  ctx.lineTo(cw, ch);
  ctx.closePath();

  // Gradient fill
  const grad = ctx.createLinearGradient(0, baseY, 0, ch);
  grad.addColorStop(0, "rgba(30, 120, 200, 0.35)");
  grad.addColorStop(0.4, "rgba(20, 80, 160, 0.5)");
  grad.addColorStop(1, "rgba(10, 40, 100, 0.65)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Surface highlight
  ctx.beginPath();
  for (let x = 0; x <= cw; x += 4) {
    const wy = getWaveY(x, baseY);
    if (x === 0) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.strokeStyle = "rgba(140, 200, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  // Draw ripples
  for (const r of ripples) {
    ctx.save();
    ctx.globalAlpha = r.life * 0.4;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(180, 220, 255, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Draw splash particles
  for (const s of splashes) {
    ctx.save();
    ctx.globalAlpha = s.life * 0.7;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * s.life, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(140, 200, 255, 0.8)";
    ctx.fill();
    ctx.restore();
  }
}
