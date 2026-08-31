"use client";
/**
 * A number that counts up to its value when it first appears
 * (transitions-dev 21-spinning-counter, calmed down). ~700ms ease-out,
 * static under prefers-reduced-motion, tabular digits so nothing shifts.
 */
import { useEffect, useRef, useState } from "react";

export function NumberTicker({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    // All updates go through rAF so the effect never sets state synchronously.
    const reduce =
      done.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    done.current = true;
    let raf = 0;
    if (reduce) {
      raf = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setShown(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className={`mono tabular-nums ${className ?? ""}`}>{shown}</span>
  );
}
