import { useEffect, useRef, useCallback, useState } from "react";
import spriteImg from "@/assets/sprite.png";

const SPEED = 5;
const OBJ_W = 80;
const OBJ_H = 90;
const CONTAINER_RATIO = 0.85;

const Index = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const objRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<string[]>([]);
  const rafRef = useRef<number>(0);
  const [showHint, setShowHint] = useState(true);

  const shake = useCallback((dx: number, dy: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.style.transform = `translate(${dx * 3}px, ${dy * 3}px)`;
    setTimeout(() => {
      el.style.transform = "translate(0, 0)";
    }, 200);
  }, []);

  const deform = useCallback((axis: "x" | "y", dir: number) => {
    const el = objRef.current;
    if (!el) return;
    if (axis === "x") {
      el.style.transform = `scaleX(0.9) scaleY(1.05)`;
    } else {
      el.style.transform = `scaleY(0.9) scaleX(1.05)`;
    }
    setTimeout(() => {
      el.style.transform = "scale(1)";
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

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!["w", "a", "s", "d"].includes(key)) return;
      setShowHint(false);
      // Most recent key priority — move to end
      keysRef.current = keysRef.current.filter((k) => k !== key);
      keysRef.current.push(key);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current = keysRef.current.filter((k) => k !== key);
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

        // Collision
        let hitX = 0, hitY = 0;
        if (nx <= 0) { nx = 0; hitX = -1; }
        if (nx >= maxX) { nx = maxX; hitX = 1; }
        if (ny <= 0) { ny = 0; hitY = -1; }
        if (ny >= maxY) { ny = maxY; hitY = 1; }

        if (hitX !== 0 && pos.x !== nx) {
          shake(hitX, 0);
          deform("x", hitX);
        }
        if (hitY !== 0 && pos.y !== ny) {
          shake(0, hitY);
          deform("y", hitY);
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
          ref={objRef as React.RefObject<HTMLImageElement>}
          src={spriteImg}
          alt="cyborg sprite"
          className="absolute"
          draggable={false}
          style={{
            width: OBJ_W,
            height: OBJ_H,
            objectFit: "contain",
            filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.25))",
            transition: "transform 150ms ease-out",
          }}
        />
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
