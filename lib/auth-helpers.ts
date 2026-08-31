/**
 * Server-side access guards. Enforcement lives HERE (and in the query
 * layers), in the Node runtime — never in UI hiding, never only in
 * middleware (CLAUDE.md §2).
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Any signed-in, active account. Redirects to /signin otherwise. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

/** Admin only. Signed-in non-admins land back on the home page. */
export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/");
  return session;
}
