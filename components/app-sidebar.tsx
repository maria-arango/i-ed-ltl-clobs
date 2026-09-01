"use client";
/**
 * App-level navigation (Amendment B §21 + the 2026-08-31 "alive" pass):
 * a left sidebar whose selection GLIDES — the lake-wash pill is a shared
 * layout element that slides to the active item (motion layoutId), and a
 * quiet hover layer glides under the pointer (GlideMenu). Notification
 * badges show what is waiting: new videos, calibrations ready.
 * All of it collapses under prefers-reduced-motion.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  Award,
  ChartLine,
  Clapperboard,
  Film,
  GraduationCap,
  Handshake,
  House,
  ListChecks,
  Users,
} from "lucide-react";
import GlideMenu from "@/components/primitives/GlideMenu";
import { SPRING_LAYOUT } from "@/lib/ease";

export interface SidebarBadges {
  /** New (unopened) videos in the coder's queue. */
  newVideos?: number;
  /** Videos ready to calibrate. */
  calibrationsReady?: number;
}

const coderItems = [
  { href: "/", label: "Home", icon: House, exact: true },
  { href: "/videos", label: "My videos", icon: Film, exact: false },
  { href: "/calibration", label: "Calibration", icon: Handshake, exact: false },
];
const adminItems = [
  { href: "/admin/team", label: "Team", icon: Users, exact: false },
  { href: "/admin/assignment", label: "Assignment", icon: ListChecks, exact: false },
  { href: "/admin/videos", label: "Video library", icon: Clapperboard, exact: false },
  { href: "/admin/gold", label: "Gold set", icon: Award, exact: false },
  { href: "/admin/training", label: "Training", icon: GraduationCap, exact: false },
  { href: "/admin/progress", label: "Progress", icon: ChartLine, exact: false },
];

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="badge-pop mono ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold"
      style={{ background: "var(--clobs-lake)", color: "var(--clobs-paper)" }}
      aria-label={`${count} waiting`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function AppSidebar({
  isAdmin,
  showCalibration = true,
  badges,
}: {
  isAdmin: boolean;
  /** Trainees code only — no calibration surface (Amendment B §9, §29). */
  showCalibration?: boolean;
  badges?: SidebarBadges;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const base = coderItems.filter(
    (i) => showCalibration || i.href !== "/calibration",
  );
  const items = isAdmin ? [...base, ...adminItems] : base;
  const badgeFor = (href: string) =>
    href === "/videos"
      ? (badges?.newVideos ?? 0)
      : href === "/calibration"
        ? (badges?.calibrationsReady ?? 0)
        : 0;

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
      <GlideMenu
        className="flex flex-1 flex-row gap-1 md:flex-none md:flex-col"
        highlightClassName="inset-x-0 rounded-md bg-sunken"
      >
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-menu-row
              aria-current={active ? "page" : undefined}
              className="relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px]"
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active-pill"
                  transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                  className="absolute inset-0 rounded-md bg-lake-wash"
                  aria-hidden
                />
              )}
              <span
                className={`relative z-10 flex w-full items-center gap-3 ${
                  active ? "font-semibold text-ink" : "text-graphite"
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                <span>{item.label}</span>
                <Badge count={badgeFor(item.href)} />
              </span>
            </Link>
          );
        })}
      </GlideMenu>
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
