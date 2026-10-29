"use client";
/**
 * App-level navigation (Amendment B §21 + the 2026-08-31 "alive" pass):
 * a left sidebar whose selection GLIDES — the lake-wash pill is a shared
 * layout element that slides to the active item (motion layoutId), and a
 * quiet hover layer glides under the pointer (GlideMenu). Notification
 * badges show what is waiting: new videos, calibrations ready.
 * All of it collapses under prefers-reduced-motion. Since Amendment §50 the
 * scoring screens are grouped under a "Scoring" heading.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  Award,
  ChartLine,
  Clapperboard,
  Download,
  FileText,
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

// Amendment §50: everything about scoring sits under one "Scoring" section
// (URLs unchanged). Team is shared by all teams; Narratives (admins) opens
// the Narratives area, which has its own frame.
type NavItem = {
  href: string;
  label: string;
  icon: typeof House;
  exact: boolean;
  adminOnly?: boolean;
  hideForTrainee?: boolean;
};
const scoringItems: NavItem[] = [
  { href: "/scoring", label: "Scoring home", icon: House, exact: true },
  { href: "/videos", label: "My videos", icon: Film, exact: false },
  { href: "/calibration", label: "Calibration", icon: Handshake, exact: false, hideForTrainee: true },
  { href: "/admin/assignment", label: "Assignment", icon: ListChecks, exact: false, adminOnly: true },
  { href: "/admin/videos", label: "Video library", icon: Clapperboard, exact: false, adminOnly: true },
  { href: "/admin/gold", label: "Gold set", icon: Award, exact: false, adminOnly: true },
  { href: "/admin/training", label: "Training", icon: GraduationCap, exact: false, adminOnly: true },
  { href: "/admin/progress", label: "Progress", icon: ChartLine, exact: false, adminOnly: true },
  { href: "/admin/exports", label: "Exports", icon: Download, exact: false, adminOnly: true },
];
const adminTopItems: NavItem[] = [
  { href: "/admin/narratives", label: "Narratives", icon: FileText, exact: false, adminOnly: true },
  { href: "/admin/team", label: "Team", icon: Users, exact: false, adminOnly: true },
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
  const visible = (i: NavItem) =>
    (isAdmin || !i.adminOnly) && (showCalibration || !i.hideForTrainee);
  const scoring = scoringItems.filter(visible);
  const top = adminTopItems.filter(visible);
  const badgeFor = (href: string) =>
    href === "/videos"
      ? (badges?.newVideos ?? 0)
      : href === "/calibration"
        ? (badges?.calibrationsReady ?? 0)
        : 0;

  const renderItem = (item: NavItem) => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
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
  };

  return (
    <nav
      aria-label="Main navigation"
      className="flex shrink-0 flex-row gap-1 border-b border-hairline bg-card px-3 py-2 md:min-h-screen md:w-56 md:flex-col md:border-b-0 md:border-r md:px-3 md:py-6"
    >
      <Link
        href="/scoring"
        className="mb-0 hidden rounded-sm px-3 pb-6 font-serif text-[19px] leading-[1.3] text-ink md:block"
      >
        LTL Classroom
        <br />
        Observations
      </Link>
      <GlideMenu
        className="flex flex-1 flex-row gap-1 overflow-x-auto md:flex-none md:flex-col md:overflow-visible"
        highlightClassName="rounded-md bg-sunken"
      >
        {top.map(renderItem)}
        <p
          id="nav-scoring-heading"
          className="hidden px-3 pb-1 pt-4 text-[12px] font-semibold text-smoke md:block"
        >
          Scoring
        </p>
        <div role="group" aria-labelledby="nav-scoring-heading" className="contents">
          {scoring.map(renderItem)}
        </div>
      </GlideMenu>
      <div className="hidden flex-1 md:block" />
      {isAdmin && (
        <Link
          href="/styleguide"
          className="hidden rounded-sm px-3 py-1 text-[12px] text-smoke underline-offset-4 hover:text-lake hover:underline md:block"
        >
          Style guide
        </Link>
      )}
    </nav>
  );
}
