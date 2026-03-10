import { useEffect, useRef, useState, useCallback } from "react";

const SPEED = 4;
const TRI_SIZE = 20;
const CONTAINER_RATIO = 0.85;
const BULLET_SPEED = 8;
const BULLET_RADIUS = 5;
const ROLL_DISTANCE = 60;
const ROLL_DURATION = 300; // ms

interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  id: number;
}

const Index = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const mouseRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const bulletsRef = useRef<Bullet[]>([]);
  const bulletIdRef = useRef(0);
  const rafRef = useRef(0);
  const rollRef = useRef<{ active: boolean; dir: -1 | 1; startTime: number; startX: number; startY: number; perpX: number; perpY: number; spinAngle: number }>({ active: false, dir: 1, startTime: 0, startX: 0, startY: 0, perpX: 0, perpY: 0, spinAngle: 0 });
  const [showHint, setShowHint] = useState(true);

  const shake = useCallback((dx: number, dy: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.style.transform = `translate(${dx * 2}px, ${dy * 2}px)`;
    setTimeout(() => { el.style.transform = "translate(0,0)"; }, 150);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (posRef.current.x === 0 && posRef.current.y === 0) {
        posRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
      }
      mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "w") { setShowHint(false); keysRef.current.add("w"); }
      if (key === " ") {
        e.preventDefault();
        setShowHint(false);
        // Fire bullet
        const pos = posRef.current;
        const mouse = mouseRef.current;
        const angle = Math.atan2(mouse.y - pos.y, mouse.x - pos.x);
        bulletsRef.current.push({
          x: pos.x + Math.cos(angle) * (TRI_SIZE + 4),
          y: pos.y + Math.sin(angle) * (TRI_SIZE + 4),
          dx: Math.cos(angle) * BULLET_SPEED,
          dy: Math.sin(angle) * BULLET_SPEED,
          id: bulletIdRef.current++,
        });
      }
      if (key === "a" || key === "d") {
        e.preventDefault();
        setShowHint(false);
        const roll = rollRef.current;
        if (!roll.active) {
          const pos = posRef.current;
          const mouse = mouseRef.current;
          const angle = Math.atan2(mouse.y - pos.y, mouse.x - pos.x);
          const dir = key === "a" ? -1 : 1;
          // Perpendicular to aim direction
          const perpX = -Math.sin(angle) * dir;
          const perpY = Math.cos(angle) * dir;
          roll.active = true;
          roll.dir = dir as -1 | 1;
          roll.startTime = performance.now();
          roll.startX = pos.x;
          roll.startY = pos.y;
          roll.perpX = perpX;
          roll.perpY = perpY;
          roll.spinAngle = 0;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const ctx = canvas.getContext("2d")!;

    const loop = () => {
      const { width: cw, height: ch } = canvas;
      const pos = posRef.current;
      const mouse = mouseRef.current;
      const angle = Math.atan2(mouse.y - pos.y, mouse.x - pos.x);

      // Barrel roll — lateral displacement is additive, not absolute
      const roll = rollRef.current;
      if (roll.active) {
        const elapsed = performance.now() - roll.startTime;
        const t = Math.min(elapsed / ROLL_DURATION, 1);
        const prevT = Math.max((elapsed - 16) / ROLL_DURATION, 0);
        // Ease out
        const ease = (v: number) => 1 - (1 - v) * (1 - v);
        const dt = ease(t) - ease(prevT);
        pos.x += roll.perpX * ROLL_DISTANCE * dt;
        pos.y += roll.perpY * ROLL_DISTANCE * dt;
        roll.spinAngle = roll.dir * Math.PI * 2 * ease(t);
        if (t >= 1) roll.active = false;
      }

      // Move toward mouse (always, including during roll)
      if (keysRef.current.has("w")) {
        const dist = Math.hypot(mouse.x - pos.x, mouse.y - pos.y);
        if (dist > 5) {
          pos.x += Math.cos(angle) * SPEED;
          pos.y += Math.sin(angle) * SPEED;
        }
      }

      // Clamp & collide
      let hitX = 0, hitY = 0;
      if (pos.x < TRI_SIZE) { pos.x = TRI_SIZE; hitX = -1; }
      if (pos.x > cw - TRI_SIZE) { pos.x = cw - TRI_SIZE; hitX = 1; }
      if (pos.y < TRI_SIZE) { pos.y = TRI_SIZE; hitY = -1; }
      if (pos.y > ch - TRI_SIZE) { pos.y = ch - TRI_SIZE; hitY = 1; }
      if (hitX) shake(hitX, 0);
      if (hitY) shake(0, hitY);

      // Update bullets
      bulletsRef.current = bulletsRef.current.filter((b) => {
        b.x += b.dx;
        b.y += b.dy;
        return b.x > -10 && b.x < cw + 10 && b.y > -10 && b.y < ch + 10;
      });

      // Draw
      ctx.clearRect(0, 0, cw, ch);

      // Bullets
      ctx.fillStyle = "#D93636";
      for (const b of bulletsRef.current) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }

      // Triangle pointing at mouse
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(angle);
      
      // Barrel roll = rotation around forward axis → in 2D this is a scale on the perpendicular (Y) axis
      // Goes 1 → 0 → -1 → 0 → 1 like a spinning top / coin flip
      if (roll.active) {
        const elapsed = performance.now() - roll.startTime;
        const t = Math.min(elapsed / ROLL_DURATION, 1);
        const rollAngle = roll.dir * Math.PI * 2 * t;
        const scaleY = Math.cos(rollAngle);
        ctx.scale(1, scaleY);
      }

      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;

      ctx.beginPath();
      ctx.moveTo(TRI_SIZE, 0);
      ctx.lineTo(-TRI_SIZE * 0.7, -TRI_SIZE * 0.6);
      ctx.lineTo(-TRI_SIZE * 0.7, TRI_SIZE * 0.6);
      ctx.closePath();
      ctx.fillStyle = "#D93636";
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };

    canvas.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [shake]);

  return (
    <div
      className="flex items-center justify-center w-screen h-screen select-none"
      style={{ backgroundColor: "var(--canvas)" }}
    >
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden"
        style={{
          width: `${CONTAINER_RATIO * 100}vw`,
          height: `${CONTAINER_RATIO * 100}vh`,
          backgroundColor: "var(--basalt)",
          transition: "transform 150ms cubic-bezier(0.22, 1, 0.36, 1)",
          cursor: "crosshair",
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
        {showHint && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 tracking-widest uppercase text-sm opacity-40 pointer-events-none"
            style={{ color: "var(--canvas)", fontFamily: "var(--font-mono)" }}
          >
            w to move · space to fire
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
