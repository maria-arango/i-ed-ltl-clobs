/**
 * The (shell) route group: every working screen shares one persistent
 * frame — sidebar and top bar live HERE, so navigating between sections
 * animates only the content pane (see template.tsx), never the chrome.
 */
import { requireSession } from "@/lib/auth-helpers";
import { AppShell } from "@/components/app-shell";

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <AppShell
      email={session.user.email}
      role={session.user.role}
      isChiefCoder={session.user.isChiefCoder}
    >
      {children}
    </AppShell>
  );
}
