// Water system: rendering, splash particles, and physics

export const WATER_RATIO = 0.25; // bottom 25% of canvas
export const WATER_SPEED_FACTOR = 0.40;
export const WAVE_AMPLITUDE = 8;
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
  color: string;
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
    + Math.sin(x * WAVE_FREQUENCY * 1.7 + waveTime * 1.3) * WAVE_AMPLITUDE * 0.5
    + Math.sin(x * WAVE_FREQUENCY * 0.6 + waveTime * 0.7) * WAVE_AMPLITUDE * 0.3;
}

export function isSubmerged(py: number, canvasHeight: number): boolean {
  const surfaceY = getWaterSurfaceY(canvasHeight);
  return py > surfaceY;
}

export function spawnSplash(x: number, y: number, vy: number, entering: boolean) {
  const count = entering ? 22 : 30;
  const baseSpeed = entering ? 4 : 7;
  const colors = [
    "rgba(140, 210, 255, 0.9)",
    "rgba(180, 230, 255, 0.85)",
    "rgba(100, 180, 240, 0.9)",
    "rgba(220, 240, 255, 0.95)",
    "rgba(60, 150, 220, 0.8)",
  ];
  for (let i = 0; i < count; i++) {
    const ang = entering
      ? -Math.PI * Math.random()
      : -Math.PI * (0.1 + Math.random() * 0.8);
    const speed = baseSpeed * (0.5 + Math.random());
    splashes.push({
      x: x + (Math.random() - 0.5) * 20,
      y,
      vx: Math.cos(ang) * speed + (Math.random() - 0.5) * 3,
      vy: Math.sin(ang) * speed * (entering ? 1 : 1.8),
      life: 1,
      maxLife: 0.5 + Math.random() * 0.4,
      radius: 2.5 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  // Multiple ripple rings
  ripples.push({ x, y, radius: 4, maxRadius: 50 + Math.abs(vy) * 10, life: 1 });
  ripples.push({ x: x - 15, y, radius: 2, maxRadius: 30 + Math.abs(vy) * 5, life: 0.8 });
  ripples.push({ x: x + 15, y, radius: 2, maxRadius: 30 + Math.abs(vy) * 5, life: 0.8 });
}

export function updateParticles(dt: number) {
  waveTime += WAVE_SPEED * dt * 60;

  splashes = splashes.filter((s) => {
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.12;
    s.vx *= 0.99;
    s.life -= dt / s.maxLife;
    return s.life > 0;
  });

  ripples = ripples.filter((r) => {
    r.life -= dt * 2.0;
    r.radius += (r.maxRadius - r.radius) * 0.06;
    return r.life > 0;
  });
}

export function drawWater(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  const baseY = getWaterSurfaceY(ch);

  // Draw water body with wave surface
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, ch);
  for (let x = 0; x <= cw; x += 3) {
    ctx.lineTo(x, getWaveY(x, baseY));
  }
  ctx.lineTo(cw, ch);
  ctx.closePath();

  // Gradient fill — richer, more liquid look
  const grad = ctx.createLinearGradient(0, baseY, 0, ch);
  grad.addColorStop(0, "rgba(20, 100, 180, 0.45)");
  grad.addColorStop(0.15, "rgba(15, 80, 160, 0.55)");
  grad.addColorStop(0.4, "rgba(10, 60, 140, 0.65)");
  grad.addColorStop(0.7, "rgba(5, 40, 110, 0.75)");
  grad.addColorStop(1, "rgba(2, 20, 70, 0.85)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Subsurface light caustics
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 6; i++) {
    const cx = (waveTime * 40 + i * cw / 5) % (cw + 100) - 50;
    const cy = baseY + 30 + Math.sin(waveTime * 0.5 + i * 2) * 20;
    const causticGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60 + Math.sin(waveTime + i) * 20);
    causticGrad.addColorStop(0, "rgba(100, 200, 255, 1)");
    causticGrad.addColorStop(1, "rgba(100, 200, 255, 0)");
    ctx.fillStyle = causticGrad;
    ctx.fillRect(cx - 80, cy - 80, 160, 160);
  }
  ctx.restore();

  // Surface highlight line
  ctx.beginPath();
  for (let x = 0; x <= cw; x += 3) {
    const wy = getWaveY(x, baseY);
    if (x === 0) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.strokeStyle = "rgba(180, 230, 255, 0.6)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Secondary softer highlight
  ctx.beginPath();
  for (let x = 0; x <= cw; x += 3) {
    const wy = getWaveY(x, baseY) + 4;
    if (x === 0) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.strokeStyle = "rgba(100, 180, 240, 0.25)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Foam/white caps at wave peaks
  for (let x = 0; x <= cw; x += 8) {
    const wy = getWaveY(x, baseY);
    const slope = getWaveY(x + 4, baseY) - wy;
    if (slope < -0.8) {
      ctx.globalAlpha = Math.min(Math.abs(slope) * 0.3, 0.35);
      ctx.beginPath();
      ctx.arc(x, wy - 1, 3 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(220, 240, 255, 0.7)";
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Draw ripples
  for (const r of ripples) {
    ctx.save();
    ctx.globalAlpha = r.life * 0.5;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.25, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(180, 230, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Inner ripple
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius * 0.6, r.radius * 0.15, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(220, 240, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Draw splash particles
  for (const s of splashes) {
    ctx.save();
    ctx.globalAlpha = s.life * 0.85;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * (0.3 + s.life * 0.7), 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
    // Highlight dot
    if (s.radius > 3) {
      ctx.beginPath();
      ctx.arc(s.x - s.radius * 0.2, s.y - s.radius * 0.2, s.radius * 0.25 * s.life, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fill();
    }
    ctx.restore();
  }
}
