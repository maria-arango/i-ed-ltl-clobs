"use client";
/**
 * "Request permission to enter" (Amendment §35): a quiet button at the foot
 * of the sign-in page that opens a small form (name + email). Requests go
 * to the admins; nothing signs in until an admin grants access.
 */
import { useState } from "react";

export function RequestAccess() {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!fullName.trim() || !email.trim()) return;
    setPending(true);
    await fetch("/api/access-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, website }),
    }).catch(() => {});
    setPending(false);
    setSent(true);
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto rounded-full border border-hairline-strong bg-paper/90 px-4 py-2 text-[13px] font-medium text-graphite backdrop-blur transition-colors duration-[90ms] hover:bg-card hover:text-ink active:scale-[0.98]"
        >
          New to the study? Request permission to enter
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Request permission to enter"
          className="overlay-fade fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(43, 38, 31, 0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="moment-enter elev-card w-full max-w-md rounded-2xl border border-hairline bg-paper p-8">
            {sent ? (
              <div className="text-center">
                <span
                  aria-hidden
                  className="mx-auto flex size-14 items-center justify-center rounded-full"
                  style={{ background: "var(--clobs-forest)" }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path
                      className="check-draw"
                      d="M5 12.5l4.5 4.5L19 7.5"
                      stroke="var(--clobs-paper)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <h3
                  className="mt-4 font-serif text-ink"
                  style={{
                    fontSize: "var(--clobs-text-heading-sm)",
                    lineHeight: "var(--clobs-leading-heading-sm)",
                  }}
                >
                  Request sent.
                </h3>
                <p className="mt-2 text-[14px] leading-[1.6] text-graphite">
                  An admin will review it and grant access for training or
                  live coding. You will be able to sign in with your email
                  once that happens.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-5 rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h3
                  className="font-serif text-ink"
                  style={{
                    fontSize: "var(--clobs-text-heading-sm)",
                    lineHeight: "var(--clobs-leading-heading-sm)",
                  }}
                >
                  Request permission to enter
                </h3>
                <p className="mt-2 text-[14px] leading-[1.6] text-graphite">
                  Leave your name and the email you want to sign in with. An
                  admin grants access; nothing is created until they do.
                </p>
                <label className="mt-4 block text-[14px] font-medium text-ink">
                  Full name
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink focus:border-hairline-strong"
                  />
                </label>
                <label className="mt-3 block text-[14px] font-medium text-ink">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mono mt-1 block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink focus:border-hairline-strong"
                  />
                </label>
                {/* Honeypot — invisible to people, irresistible to bots. */}
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                  className="absolute -left-[9999px] h-0 w-0 opacity-0"
                />
                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-hairline bg-paper px-4 py-2 text-[14px] font-medium text-graphite transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={pending || !fullName.trim() || !email.trim()}
                    onClick={() => void send()}
                    className="rounded-md bg-bark px-[18px] py-[10px] text-[14px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
                  >
                    {pending ? "Sending…" : "Send the request"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
