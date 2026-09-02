"use client";
/**
 * Client widgets for the Training space: the sliding two-view switch
 * (Accounts / Dashboard), the add-trainee form, per-row pack assignment,
 * and the sandbox button for admins.
 */
import { useActionState, useRef, useState, useTransition, useEffect } from "react";
import { PillButton } from "@/components/ui/pill-button";
import {
  addTraineeAction,
  assignPackAction,
  createDemoAction,
  enterSandboxAction,
  removePackAction,
  resetDemoAction,
  type TrainingActionResult,
} from "./actions";

/* ------------------------- sliding view switch ------------------------ */

export function TrainingViews({
  accounts,
  dashboard,
}: {
  accounts: React.ReactNode;
  dashboard: React.ReactNode;
}) {
  const [view, setView] = useState<"accounts" | "dashboard">("accounts");
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-view="${view}"]`,
    );
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [view]);

  const tab = (key: "accounts" | "dashboard", label: string) => (
    <button
      type="button"
      data-view={key}
      role="tab"
      aria-selected={view === key}
      onClick={() => setView(key)}
      className={`relative z-10 rounded-full px-5 py-2 text-[14px] font-medium transition-colors duration-[150ms] ${
        view === key ? "text-ink" : "text-graphite hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Training views"
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
        {tab("accounts", "Enumerator accounts")}
        {tab("dashboard", "Dashboard")}
      </div>
      <div hidden={view !== "accounts"}>{accounts}</div>
      <div hidden={view !== "dashboard"}>{dashboard}</div>
    </div>
  );
}

/* ------------------------------ sandbox ------------------------------- */

export function SandboxButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const run = (fn: () => Promise<TrainingActionResult>, okText: (n: number) => string) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      setMessage(
        r.ok
          ? { kind: "ok", text: okText(r.assigned ?? 0) }
          : { kind: "error", text: r.error ?? "Something went wrong" },
      );
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(enterSandboxAction, (n) =>
            n > 0
              ? `${n} training videos added to My videos — go live the coder's week.`
              : "Your sandbox pack is already in My videos.",
          )
        }
        className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
      >
        {pending ? "Working…" : "Assign me the training pack"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            setTimeout(() => setConfirming(false), 4000);
            return;
          }
          setConfirming(false);
          run(removePackAction, (n) =>
            n > 0
              ? `${n} pack videos and everything you coded on them removed.`
              : "You have no pack videos to remove.",
          );
        }}
        className="rounded-md border border-hairline bg-paper px-4 py-2 text-[14px] font-semibold text-clay transition-colors duration-[90ms] hover:border-clay hover:bg-card active:scale-[0.98] disabled:text-ash"
      >
        {confirming ? "Click again: remove my pack work" : "Remove my training pack"}
      </button>
      <span aria-live="polite" className="text-[13px]">
        {message?.kind === "error" && <span className="text-clay">{message.text}</span>}
        {message?.kind === "ok" && (
          <span style={{ color: "var(--clobs-forest)" }}>{message.text}</span>
        )}
      </span>
    </div>
  );
}

/* ----------------------------- add trainee ---------------------------- */

export function AddTraineeForm() {
  const [state, action, pending] = useActionState<TrainingActionResult | null, FormData>(
    addTraineeAction,
    null,
  );
  return (
    <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
      <h3 className="text-[15px] font-medium text-ink">Add a training enumerator</h3>
      <p className="mt-1 text-[13px] leading-[1.5] text-graphite">
        The account can sign in immediately with an email code, sees ONLY the
        training pack (the gold videos, assigned on creation), and nothing
        they do can touch live data. Accounts that do not survive training
        are simply deactivated or deleted from the Team screen.
      </p>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-[14px] font-medium text-ink">
          Email
          <input
            name="email"
            type="email"
            required
            placeholder="name@organisation.org"
            className="mono mt-1 block w-72 rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink focus:border-hairline-strong"
          />
        </label>
        <label className="block text-[14px] font-medium text-ink">
          Full name
          <input
            name="name"
            placeholder="Optional"
            className="mt-1 block w-56 rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink focus:border-hairline-strong"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:text-ash"
        >
          {pending ? "Adding…" : "Add trainee"}
        </button>
      </form>
      <p aria-live="polite" className="mt-2 text-[13px]">
        {state && !state.ok && <span className="text-clay">{state.error}</span>}
        {state?.ok && (
          <span style={{ color: "var(--clobs-forest)" }}>
            Trainee added, {state.assigned ?? 0} training videos assigned.
          </span>
        )}
      </p>
    </div>
  );
}

export function AssignPackButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-[12px] text-clay">{error}</span>}
      <PillButton
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await assignPackAction(userId);
            if (!r.ok) setError(r.error ?? "Something went wrong");
          })
        }
      >
        Assign the pack
      </PillButton>
    </span>
  );
}

/* --------------------------- demo controls ---------------------------- */

export function DemoButtons() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const run = (fn: () => Promise<TrainingActionResult>, okText: (n: number) => string) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      setMessage(
        r.ok
          ? { kind: "ok", text: okText(r.assigned ?? 0) }
          : { kind: "error", text: r.error ?? "Something went wrong" },
      );
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(createDemoAction, (n) =>
            n > 0
              ? `${n} demo video${n === 1 ? "" : "s"} added to My videos (calibration partner included).`
              : "Your demo videos already exist — find them in My videos.",
          )
        }
        className="rounded-md border border-hairline-strong bg-paper px-4 py-2 text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:text-ash"
      >
        {pending ? "Working…" : "Give me demo videos"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            setTimeout(() => setConfirming(false), 4000);
            return;
          }
          setConfirming(false);
          run(resetDemoAction, (n) =>
            n > 0
              ? `${n} demo video${n === 1 ? "" : "s"} and everything coded on them deleted. Your dashboard starts fresh.`
              : "No demo videos to delete.",
          );
        }}
        className="rounded-md border border-hairline bg-paper px-4 py-2 text-[14px] font-semibold text-clay transition-colors duration-[90ms] hover:border-clay hover:bg-card active:scale-[0.98] disabled:text-ash"
      >
        {confirming ? "Click again: delete demo data forever" : "Delete my demo videos & data"}
      </button>
      <span aria-live="polite" className="text-[13px]">
        {message?.kind === "error" && <span className="text-clay">{message.text}</span>}
        {message?.kind === "ok" && (
          <span style={{ color: "var(--clobs-forest)" }}>{message.text}</span>
        )}
      </span>
    </div>
  );
}
