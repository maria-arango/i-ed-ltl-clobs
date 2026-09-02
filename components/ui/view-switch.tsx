"use client";
/**
 * The sliding two-view switch (same glide as the Training screen): a pill
 * that slides between views, panels stay mounted so nothing is lost.
 */
import { useEffect, useRef, useState } from "react";

export function ViewSwitch({
  views,
  ariaLabel,
}: {
  views: Array<{ key: string; label: string; content: React.ReactNode }>;
  ariaLabel: string;
}) {
  const [active, setActive] = useState(views[0]?.key);
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-view="${active}"]`,
    );
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active]);

  return (
    <div className="space-y-6">
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        className="elev-card relative inline-flex rounded-full border border-hairline bg-card p-1"
      >
        <span
          aria-hidden
          className="absolute inset-y-1 rounded-full bg-paper transition-[transform,width] duration-[220ms] ease-inout-clobs motion-reduce:transition-none"
          style={{
            width: pill.width,
            transform: `translateX(${pill.left - 4}px)`,
            boxShadow: "var(--clobs-shadow-card)",
          }}
        />
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            data-view={v.key}
            role="tab"
            aria-selected={active === v.key}
            onClick={() => setActive(v.key)}
            className={`relative z-10 rounded-full px-5 py-2 text-[14px] font-medium transition-colors duration-[150ms] ${
              active === v.key ? "text-ink" : "text-graphite hover:text-ink"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {views.map((v) => (
        <div key={v.key} hidden={active !== v.key}>
          {v.content}
        </div>
      ))}
    </div>
  );
}
