// Water jet trail particles behind the player ship

export interface JetParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

let particles: JetParticle[] = [];

export function resetJetTrail() {
  particles = [];
}

export function spawnJetParticles(
  x: number, y: number,
  angle: number,
  throttle: number,
  submerged: boolean
) {
  if (throttle < 0.1) return;

  const count = submerged ? 1 : Math.ceil(throttle * 3);
  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 0.6;
    const backAngle = angle + Math.PI + spread;
    const speed = 1.5 + Math.random() * 2 * throttle;
    particles.push({
      x: x - Math.cos(angle) * 14 + (Math.random() - 0.5) * 4,
      y: y - Math.sin(angle) * 14 + (Math.random() - 0.5) * 4,
      vx: Math.cos(backAngle) * speed,
      vy: Math.sin(backAngle) * speed + 0.3,
      life: 1,
      maxLife: 0.3 + Math.random() * 0.25,
      size: 2 + Math.random() * 3 * throttle,
    });
  }
}

export function updateJetTrail(dt: number) {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt / p.maxLife;
    p.size *= 0.98;
  }
  particles = particles.filter(p => p.life > 0);
}

export function drawJetTrail(ctx: CanvasRenderingContext2D) {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life * 0.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    // Light blue water color with white core
    ctx.fillStyle = `rgba(150, 210, 255, ${p.life * 0.5})`;
    ctx.fill();
    if (p.size > 2) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 240, 255, ${p.life * 0.7})`;
      ctx.fill();
    }
    ctx.restore();
  }
}
