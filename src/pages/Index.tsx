import { useEffect, useRef, useCallback, useState } from "react";
import spriteDown from "@/assets/sprite-down.png";
import spriteUp from "@/assets/sprite-up.png";
import spriteLeft from "@/assets/sprite-left.png";
import spriteIdle from "@/assets/sprite.png";

const SPEED = 5;
const OBJ_W = 80;
const OBJ_H = 90;
const CONTAINER_RATIO = 0.85;

type Direction = "up" | "down" | "left" | "right" | "idle";

const SPRITE_MAP: Record<Direction, { src: string; flipX: boolean }> = {
  idle: { src: spriteIdle, flipX: false },
  down: { src: spriteDown, flipX: false },
  up: { src: spriteUp, flipX: false },
  left: { src: spriteLeft, flipX: false },
  right: { src: spriteLeft, flipX: true },
};

const Index = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const objRef = useRef<HTMLImageElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<string[]>([]);
  const rafRef = useRef<number>(0);
  const [showHint, setShowHint] = useState(true);
  const [direction, setDirection] = useState<Direction>("idle");
  const [isMoving, setIsMoving] = useState(false);
  const dirRef = useRef<Direction>("idle");

  const shake = useCallback((dx: number, dy: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.style.transform = `translate(${dx * 3}px, ${dy * 3}px)`;
    setTimeout(() => {
      el.style.transform = "translate(0, 0)";
    }, 200);
  }, []);

  const deform = useCallback((axis: "x" | "y") => {
    const el = objRef.current;
    if (!el) return;
    const base = dirRef.current === "right" ? "scaleX(-1)" : "";
    if (axis === "x") {
      el.style.transform = `${base} scaleX(${dirRef.current === "right" ? "-0.9" : "0.9"}) scaleY(1.05)`;
    } else {
      el.style.transform = `${base} scaleY(0.9) scaleX(${dirRef.current === "right" ? "-1.05" : "1.05"})`;
    }
    setTimeout(() => {
      el.style.transform = dirRef.current === "right" ? "scaleX(-1)" : "scale(1)";
    }, 150);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const obj = objRef.current;
    if (!container || !obj) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    posRef.current = { x: (cw - OBJ_W) / 2, y: (ch - OBJ_H) / 2 };
    obj.style.left = posRef.current.x + "px";
    obj.style.top = posRef.current.y + "px";

    const keyToDir: Record<string, Direction> = {
      w: "up", s: "down", a: "left", d: "right",
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!["w", "a", "s", "d"].includes(key)) return;
      setShowHint(false);
      keysRef.current = keysRef.current.filter((k) => k !== key);
      keysRef.current.push(key);
      const newDir = keyToDir[key];
      dirRef.current = newDir;
      setDirection(newDir);
      setIsMoving(true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current = keysRef.current.filter((k) => k !== key);
      if (keysRef.current.length === 0) {
        setIsMoving(false);
        dirRef.current = "idle";
        setDirection("idle");
      } else {
        const lastKey = keysRef.current[keysRef.current.length - 1];
        const newDir = keyToDir[lastKey];
        dirRef.current = newDir;
        setDirection(newDir);
      }
    };

    const loop = () => {
      const keys = keysRef.current;
      const activeKey = keys[keys.length - 1];
      if (activeKey) {
        const pos = posRef.current;
        const maxX = container.clientWidth - OBJ_W;
        const maxY = container.clientHeight - OBJ_H;
        let nx = pos.x;
        let ny = pos.y;

        if (activeKey === "a") nx -= SPEED;
        if (activeKey === "d") nx += SPEED;
        if (activeKey === "w") ny -= SPEED;
        if (activeKey === "s") ny += SPEED;

        let hitX = 0, hitY = 0;
        if (nx <= 0) { nx = 0; hitX = -1; }
        if (nx >= maxX) { nx = maxX; hitX = 1; }
        if (ny <= 0) { ny = 0; hitY = -1; }
        if (ny >= maxY) { ny = maxY; hitY = 1; }

        if (hitX !== 0 && pos.x !== nx) {
          shake(hitX, 0);
          deform("x");
        }
        if (hitY !== 0 && pos.y !== ny) {
          shake(0, hitY);
          deform("y");
        }

        pos.x = nx;
        pos.y = ny;
        if (obj) {
          obj.style.left = nx + "px";
          obj.style.top = ny + "px";
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [shake, deform]);

  const spriteInfo = SPRITE_MAP[direction];

  return (
    <div
      className="flex items-center justify-center w-screen h-screen select-none"
      style={{ backgroundColor: "var(--canvas)" }}
    >
      <div
        ref={containerRef}
        className="relative rounded-lg"
        style={{
          width: `${CONTAINER_RATIO * 100}vw`,
          height: `${CONTAINER_RATIO * 100}vh`,
          backgroundColor: "var(--basalt)",
          transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <img
          ref={objRef}
          src={spriteInfo.src}
          alt="cyborg sprite"
          className="absolute"
          draggable={false}
          style={{
            width: OBJ_W,
            height: OBJ_H,
            objectFit: "contain",
            filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.25))",
            transition: "transform 150ms ease-out",
            transform: spriteInfo.flipX ? "scaleX(-1)" : "scale(1)",
            animation: isMoving ? "jetpack-bob 0.3s ease-in-out infinite alternate" : "jetpack-idle 2s ease-in-out infinite alternate",
          }}
        />
        {/* Jetpack flame glow */}
        {isMoving && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 30,
              height: 30,
              background: "radial-gradient(circle, rgba(0,200,255,0.4) 0%, transparent 70%)",
              left: posRef.current.x + OBJ_W / 2 - 15,
              top: posRef.current.y + OBJ_H + 5,
              animation: "flame-flicker 0.15s ease-in-out infinite alternate",
            }}
          />
        )}
        {showHint && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 tracking-widest uppercase text-sm opacity-40"
            style={{ color: "var(--canvas)", fontFamily: "var(--font-mono)" }}
          >
            use wasd
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
