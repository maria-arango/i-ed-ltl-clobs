"use client";
/**
 * Gentle pointer-tracked 3D tilt (transitions-dev 20-3d-tilt, calmed):
 * max ±3.5°, transform only, springs back on leave. Pointer devices only;
 * inert under prefers-reduced-motion and on touch. For Boundary surfaces
 * (sign-in) — never on the coding grid.
 */
import { useRef, useState } from "react";

const MAX_DEG = 3.5;

export function TiltCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [tracking, setTracking] = useState(false);

  const allowed = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        if (!allowed() || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        setTracking(true);
        setTilt({ x: -py * MAX_DEG * 2, y: px * MAX_DEG * 2 });
      }}
      onPointerLeave={() => {
        setTracking(false);
        setTilt({ x: 0, y: 0 });
      }}
      className={className}
      style={{
        transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: tracking
          ? "transform 80ms linear"
          : "transform 400ms var(--clobs-ease-out)",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}
