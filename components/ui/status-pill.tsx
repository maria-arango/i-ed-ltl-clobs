/** Observation status pill — one shared definition (home, queue, admin). */
export function StatusPill({ status }: { status: string | null }) {
  const map: Record<string, { bg: string; fg: string; text: string }> = {
    submitted: {
      bg: "var(--clobs-forest-wash)",
      fg: "var(--clobs-forest)",
      text: "Complete",
    },
    in_progress: {
      bg: "var(--clobs-lake-wash)",
      fg: "var(--clobs-lake)",
      text: "In progress",
    },
  };
  const s = (status && map[status]) || {
    bg: "var(--clobs-sunken)",
    fg: "var(--clobs-graphite)",
    text: "Not started",
  };
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.text}
    </span>
  );
}
