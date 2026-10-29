"use client";
/**
 * Which enumerator teams an account belongs to (Amendment §49). Toggling
 * off keeps the membership history (removed_at), never deletes.
 */
import { useState, useTransition } from "react";
import { TEAMS, TEAM_LABELS, type Team } from "@/lib/teams";
import { setTeamAction } from "./actions";

export function TeamPicker({ userId, value }: { userId: string; value: Team[] }) {
  const [current, setCurrent] = useState<Team[]>(value);
  const [pending, start] = useTransition();
  return (
    <span role="group" aria-label="Teams" className="inline-flex flex-wrap gap-1">
      {TEAMS.map((t) => {
        const on = current.includes(t);
        return (
          <button
            key={t}
            type="button"
            disabled={pending}
            aria-pressed={on}
            onClick={() =>
              start(async () => {
                const r = await setTeamAction(userId, t, !on);
                if (r.ok) setCurrent(on ? current.filter((x) => x !== t) : [...current, t]);
              })
            }
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-[90ms] ${
              on
                ? "border-transparent bg-lake-wash text-ink"
                : "border-hairline-strong bg-paper text-graphite hover:text-ink"
            }`}
          >
            {TEAM_LABELS[t]}
          </button>
        );
      })}
    </span>
  );
}
