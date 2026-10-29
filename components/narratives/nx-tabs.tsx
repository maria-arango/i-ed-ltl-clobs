"use client";
/** Top-bar tabs for the Narratives area; marks the current one. */
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NxTab {
  href: string;
  label: string;
}

export function NxTabs({ tabs }: { tabs: NxTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex items-stretch gap-1 self-stretch">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center border-b-2 px-3 text-[14px] font-medium ${
              active
                ? "border-nx-accent text-nx-text"
                : "border-transparent text-nx-muted hover:text-nx-text"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
