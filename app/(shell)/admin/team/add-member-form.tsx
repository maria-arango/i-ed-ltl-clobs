"use client";
/**
 * "Add a teammate" — the only door into the platform (no self-signup).
 * Comfortable density; inline result; clears on success.
 */
import { useActionState, useEffect, useRef } from "react";
import { addMemberAction, type ActionResult } from "./actions";

const inputCls =
  "w-full rounded-md border border-hairline bg-paper px-3 py-2.5 text-[15px] text-ink placeholder:text-ash focus:border-hairline-strong";

export function AddMemberForm() {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    addMemberAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="elev-card rounded-xl border border-hairline bg-card p-6"
    >
      <h2
        className="font-sans font-medium text-ink"
        style={{
          fontSize: "var(--clobs-text-heading-sm)",
          lineHeight: "var(--clobs-leading-heading-sm)",
          letterSpacing: "var(--clobs-tracking-heading-sm)",
        }}
      >
        Add a teammate
      </h2>
      <p className="mt-1 text-[13px] leading-[1.5] text-graphite">
        From the moment you add them, this email can sign in with a one-time
        code. There is no other way in.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-[14px] font-medium text-ink">
          Work email
          <input
            name="email"
            type="email"
            required
            placeholder="name@organisation.org"
            className={`mt-1 ${inputCls}`}
          />
        </label>
        <label className="block text-[14px] font-medium text-ink">
          Full name
          <input name="name" placeholder="Optional" className={`mt-1 ${inputCls}`} />
        </label>
        <label className="block text-[14px] font-medium text-ink">
          Role
          <select name="role" defaultValue="coder" className={`mt-1 ${inputCls}`}>
            <option value="coder">Coder</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" name="chief" className="size-4 accent-[var(--clobs-bark)]" />
            Chief coder (may anchor a pair)
          </label>
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" name="trainee" className="size-4 accent-[var(--clobs-bark)]" />
            Trainee (training sandbox only)
          </label>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div aria-live="polite" className="text-[13px]">
          {result && !result.ok && <span className="text-clay">{result.error}</span>}
          {result?.ok && (
            <span style={{ color: "var(--clobs-forest)" }}>
              Added. They can sign in now.
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ash"
        >
          {pending ? "Adding…" : "Add teammate"}
        </button>
      </div>
    </form>
  );
}
