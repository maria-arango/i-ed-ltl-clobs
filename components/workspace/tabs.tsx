"use client";
/**
 * Workspace tabs with the sliding indicator (DESIGN_SYSTEM §5 →
 * transitions-dev 16-tabs-sliding): 220ms ease-inout on transform/width,
 * nothing under reduced motion. Panels stay mounted so form state and
 * autosave are never lost by switching tabs.
 */
import { useEffect, useRef, useState } from "react";
import GlideMenu from "@/components/primitives/GlideMenu";

export interface TabDef {
  id: string;
  label: string;
  badge?: string | null;
}

export function WorkspaceTabs({
  tabs,
  children,
  initialTab,
}: {
  tabs: TabDef[];
  /** Panels in the same order as `tabs`. */
  children: React.ReactNode[];
  initialTab?: string;
}) {
  const [active, setActive] = useState(initialTab ?? tabs[0]?.id);
  const listRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab="${active}"]`,
    );
    if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active, tabs]);

  return (
    <div>
      <GlideMenu
        role="tablist"
        aria-label="Workspace sections"
        className="flex !flex-row gap-1 border-b border-hairline"
        highlightClassName="rounded-t-md bg-sunken"
      >
       <div ref={listRef} className="contents">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tab={tab.id}
            role="tab"
            type="button"
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            data-menu-row
            className={`relative z-10 rounded-t-md px-4 py-2 text-[14px] font-medium ${
              active === tab.id ? "text-ink" : "text-smoke hover:text-graphite"
            }`}
          >
            {tab.label}
            {tab.badge ? (
              <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-[11px] text-graphite">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
        <span
          aria-hidden
          className="absolute bottom-[-1px] z-10 h-[2px] bg-lake transition-[transform,width] duration-[220ms] ease-inout-clobs motion-reduce:transition-none"
          style={{
            width: underline.width,
            transform: `translateX(${underline.left}px)`,
          }}
        />
       </div>
      </GlideMenu>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          hidden={active !== tab.id}
          className="pt-6"
        >
          {children[i]}
        </div>
      ))}
    </div>
  );
}
