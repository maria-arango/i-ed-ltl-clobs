"use client";
/**
 * App-level navigation (Amendment B §21): a left sidebar with icons.
 * Active item carries the lake wash; more entries appear as their screens
 * arrive (Calibration, My progress, Export).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Film, House, ListChecks, Users } from "lucide-react";

const coderItems = [
  { href: "/", label: "Home", icon: House, exact: true },
  { href: "/videos", label: "My videos", icon: Film, exact: false },
];
const adminItems = [
  { href: "/admin/team", label: "Team", icon: Users, exact: false },
  { href: "/admin/assignment", label: "Assignment", icon: ListChecks, exact: false },
];

export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...coderItems, ...adminItems] : coderItems;

  return (
    <nav
      aria-label="Main navigation"
      className="flex shrink-0 flex-row gap-1 border-b border-hairline bg-card px-3 py-2 md:min-h-screen md:w-56 md:flex-col md:border-b-0 md:border-r md:px-3 md:py-6"
    >
      <Link
        href="/"
        className="mb-0 hidden rounded-sm px-3 pb-6 font-serif text-[19px] leading-[1.3] text-ink md:block"
      >
        LTL Classroom
        <br />
        Observations
      </Link>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-colors duration-[90ms] ${
              active
                ? "bg-lake-wash font-semibold text-ink"
                : "text-graphite hover:bg-sunken hover:text-ink"
            }`}
          >
            <Icon size={17} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <div className="hidden flex-1 md:block" />
      <Link
        href="/styleguide"
        className="hidden rounded-sm px-3 py-1 text-[12px] text-smoke underline-offset-4 hover:text-lake hover:underline md:block"
      >
        Style guide
      </Link>
    </nav>
  );
}
