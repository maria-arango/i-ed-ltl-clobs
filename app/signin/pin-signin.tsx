"use client";
/**
 * Email + 4-digit PIN sign-in (Amendment §53, ADR 0003). The email field
 * lets the browser offer addresses typed before on this device (the
 * "pick your name" of ODK without publishing the roster). The PIN is never
 * offered for saving: devices are lent between enumerators.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

const MESSAGES: Record<string, string> = {
  invalid: "That email and PIN do not match. Check both and try again.",
  locked: "Too many wrong PINs. This account is locked for a while; try again later or ask a coordinator.",
  hard_locked: "This account is locked after too many wrong PINs. Ask a coordinator for a new PIN.",
  throttled: "Too many attempts from this connection. Wait 15 minutes and try again.",
  error: "Something went wrong. Check your connection and try again.",
};

export function PinSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setLockedUntil(null);
    const res = await fetch("/api/pin-signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, pin }),
    }).catch(() => null);
    if (res?.ok) {
      // The session cookie is set: let "/" send the person to their area.
      router.replace("/");
      router.refresh();
      return;
    }
    const body = (await res?.json().catch(() => null)) as { reason?: string; lockedUntil?: string } | null;
    setError(MESSAGES[body?.reason ?? "error"] ?? MESSAGES.error);
    if (body?.lockedUntil) setLockedUntil(body.lockedUntil);
    setPin("");
    setPending(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-[14px] font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-nx-border-strong bg-nx-surface px-3 py-2.5 text-[16px]"
        />
      </div>
      <div>
        <label htmlFor="pin" className="block text-[14px] font-medium">
          4-digit PIN
        </label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete="off"
          required
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="mt-1 w-40 rounded-md border border-nx-border-strong bg-nx-surface px-3 py-2.5 text-[20px] tracking-[0.4em]"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-nx-danger bg-nx-danger-wash px-3 py-2 text-[14px]">
          {error}
          {lockedUntil && (
            <> Try again after {new Date(lockedUntil).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.</>
          )}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !email || pin.length !== 4}
        className="w-full rounded-md bg-nx-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-nx-accent-hover disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-[13px] text-nx-muted">
        On a shared or borrowed device, always press <strong>Sign out</strong> when you finish, so your work is never
        saved under your name by someone else.
      </p>
    </form>
  );
}
