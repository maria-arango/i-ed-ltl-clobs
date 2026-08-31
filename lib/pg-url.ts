/**
 * Normalise a Postgres connection string's TLS mode.
 *
 * Neon's dashboard hands out URLs with `sslmode=require`. The pg driver
 * (v8) already treats that as `verify-full`, but prints a loud SECURITY
 * WARNING on every process start saying the alias will weaken in pg v9.
 * Pinning `verify-full` keeps today's behaviour, silences the warning,
 * and is forward-proof — without anyone having to edit .env.local or the
 * Vercel environment.
 */
export function hardenSslMode(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/\bsslmode=require\b/, "sslmode=verify-full");
}
