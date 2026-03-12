// Water jet propulsion system — concentrated stream + spray mist

export interface JetParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  type: 'core' | 'spray' | 'mist' | 'drip';
  opacity: number;
}

let particles: JetParticle[] = [];

export function resetJetTrail() {
  particles = [];
}

export function spawnJetParticles(
  x: number, y: number,
  angle: number,
  throttle: number,
  submerged: boolean,
  fuel: number,
  maxFuel: number,
) {
  if (throttle < 0.05) return;

  const fuelRatio = fuel / maxFuel;
  const sputtering = fuelRatio < 0.25;

  // When sputtering, randomly skip frames for choppy effect
  if (sputtering && Math.random() > fuelRatio * 3 + 0.15) return;

  const backAngle = angle + Math.PI;
  const effectiveThrottle = sputtering ? throttle * (0.3 + Math.random() * 0.5) : throttle;

  // === CORE STREAM: tight concentrated water beam ===
  const coreCount = submerged ? 1 : Math.ceil(effectiveThrottle * 4);
  for (let i = 0; i < coreCount; i++) {
    const spread = (Math.random() - 0.5) * 0.15; // very tight spread
    const streamAngle = backAngle + spread;
    const speed = 3.5 + Math.random() * 3 * effectiveThrottle;
    const distBack = 14 + Math.random() * 4;
    particles.push({
      x: x + Math.cos(backAngle) * distBack + (Math.random() - 0.5) * 2,
      y: y + Math.sin(backAngle) * distBack + (Math.random() - 0.5) * 2,
      vx: Math.cos(streamAngle) * speed,
      vy: Math.sin(streamAngle) * speed,
      life: 1,
      maxLife: 0.18 + Math.random() * 0.12,
      size: 2.5 + Math.random() * 2 * effectiveThrottle,
      type: 'core',
      opacity: 0.85,
    });
  }

  // === SPRAY: wider fan of droplets around the core ===
  if (!submerged && effectiveThrottle > 0.3) {
    const sprayCount = Math.ceil(effectiveThrottle * 3);
    for (let i = 0; i < sprayCount; i++) {
      const spread = (Math.random() - 0.5) * 1.2; // wider fan
      const sprayAngle = backAngle + spread;
      const speed = 1.5 + Math.random() * 2.5 * effectiveThrottle;
      const distBack = 16 + Math.random() * 6;
      particles.push({
        x: x + Math.cos(backAngle) * distBack + (Math.random() - 0.5) * 6,
        y: y + Math.sin(backAngle) * distBack + (Math.random() - 0.5) * 6,
        vx: Math.cos(sprayAngle) * speed,
        vy: Math.sin(sprayAngle) * speed + 0.5, // slight gravity pull
        life: 1,
        maxLife: 0.15 + Math.random() * 0.15,
        size: 1 + Math.random() * 2,
        type: 'spray',
        opacity: 0.5,
      });
    }
  }

  // === MIST: large, fading cloud behind the stream ===
  if (!submerged && effectiveThrottle > 0.5 && Math.random() < effectiveThrottle * 0.6) {
    const distBack = 22 + Math.random() * 10;
    particles.push({
      x: x + Math.cos(backAngle) * distBack + (Math.random() - 0.5) * 8,
      y: y + Math.sin(backAngle) * distBack + (Math.random() - 0.5) * 8,
      vx: Math.cos(backAngle) * 0.5 + (Math.random() - 0.5) * 0.8,
      vy: 0.2 + Math.random() * 0.3, // drifts down
      life: 1,
      maxLife: 0.3 + Math.random() * 0.3,
      size: 6 + Math.random() * 8 * effectiveThrottle,
      type: 'mist',
      opacity: 0.15,
    });
  }

  // === DRIPS: occasional larger drops that fall with gravity ===
  if (!submerged && Math.random() < effectiveThrottle * 0.25) {
    const spread = (Math.random() - 0.5) * 0.8;
    const dripAngle = backAngle + spread;
    const speed = 1 + Math.random() * 1.5;
    const distBack = 18 + Math.random() * 8;
    particles.push({
      x: x + Math.cos(backAngle) * distBack + (Math.random() - 0.5) * 6,
      y: y + Math.sin(backAngle) * distBack,
      vx: Math.cos(dripAngle) * speed,
      vy: Math.sin(dripAngle) * speed,
      life: 1,
      maxLife: 0.4 + Math.random() * 0.3,
      size: 2 + Math.random() * 2,
      type: 'drip',
      opacity: 0.7,
    });
  }
}

export function updateJetTrail(dt: number) {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;

    if (p.type === 'core') {
      p.vx *= 0.93;
      p.vy *= 0.93;
      p.size *= 0.97;
    } else if (p.type === 'spray') {
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.vy += 0.04; // light gravity
    } else if (p.type === 'mist') {
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.size *= 1.02; // expands
    } else if (p.type === 'drip') {
      p.vy += 0.12; // heavier gravity
      p.vx *= 0.99;
      p.size *= 0.995;
    }

    p.life -= dt / p.maxLife;
  }
  particles = particles.filter(p => p.life > 0);
}

export function drawJetTrail(ctx: CanvasRenderingContext2D) {
  for (const p of particles) {
    ctx.save();

    if (p.type === 'core') {
      // Bright white-blue concentrated stream
      const alpha = p.life * p.opacity;
      ctx.globalAlpha = alpha;
      // Outer glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 180, 255, ${alpha * 0.3})`;
      ctx.fill();
      // Core
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 220, 255, ${alpha * 0.8})`;
      ctx.fill();
      // Bright center
      if (p.size > 1.5) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240, 250, 255, ${alpha * 0.9})`;
        ctx.fill();
      }
    } else if (p.type === 'spray') {
      // Small blue droplets
      const alpha = p.life * p.opacity;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(140, 200, 255, ${alpha * 0.7})`;
      ctx.fill();
    } else if (p.type === 'mist') {
      // Large, soft, translucent clouds
      const alpha = p.life * p.opacity;
      ctx.globalAlpha = alpha;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, `rgba(160, 210, 255, ${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(160, 210, 255, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    } else if (p.type === 'drip') {
      // Elongated falling drops
      const alpha = p.life * p.opacity;
      ctx.globalAlpha = alpha;
      const speed = Math.hypot(p.vx, p.vy);
      const stretch = Math.min(speed * 0.4, 2.5);
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * (1 + stretch), p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(130, 200, 255, ${alpha * 0.6})`;
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * Compute a pitch angle offset based on thrust state.
 * Positive = nose up (thrusting), negative = nose down (falling/stalling).
 */
export function getShipPitch(
  throttle: number,
  isMoving: boolean,
  vy: number,
  submerged: boolean,
): number {
  if (submerged) return 0;

  // Thrusting: nose tilts up slightly
  if (isMoving && throttle > 0.3) {
    return -0.12 * throttle; // negative = nose up relative to movement direction
  }

  // Falling/stalling: nose dips
  if (vy > 1) {
    const dip = Math.min(vy / 7, 1);
    return 0.25 * dip; // positive = nose down
  }

  return 0;
}
