/**
 * "/" — the landing page everyone starts from (Amendment §51). Signed-in
 * people go straight to their own area; everyone else sees a short
 * description and Sign in.
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getActiveTeams } from "@/lib/db/teams";
import { homePathFor } from "@/lib/teams";
import { NxLinkButton } from "@/components/narratives/nx-ui";

export default async function Landing() {
  const session = await auth();
  if (session?.user) {
    const teams = await getActiveTeams(session.user.id);
    redirect(homePathFor(session.user.role, teams));
  }
  return (
    <div className="nx-area flex min-h-screen flex-col">
      <header className="border-b border-nx-border bg-nx-surface">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center px-4 sm:px-6">
          <span className="text-[15px] font-semibold">LTL Classroom Observations</span>
          <NxLinkButton href="/signin" variant="primary" className="ml-auto">
            Sign in
          </NxLinkButton>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-14 sm:px-6 sm:py-20">
        <h1 className="max-w-[720px] text-[32px] font-semibold leading-tight sm:text-[40px]">
          Classroom observation workspace
        </h1>
        <p className="mt-4 max-w-[640px] text-[17px] text-nx-muted">
          For the LTL classroom observation team. Narrative reviewers check AI-written lesson
          narratives against the recorded lesson and correct them. Your work saves as you type,
          on this device and on the server.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <NxLinkButton href="/signin" variant="primary" className="px-5 py-2.5 text-[15px]">
            Sign in
          </NxLinkButton>
          <span className="text-[14px] text-nx-muted">
            Access is by invitation from the study coordinators.
          </span>
        </div>
        <div className="mt-16 grid max-w-[900px] gap-4 sm:grid-cols-3">
          {[
            ["Your list", "The narratives assigned to you, in the order to do them."],
            ["Correct in place", "Red for additions, strikethrough for errors, comments for doubts."],
            ["Nothing is lost", "Saved continuously, even offline or if the battery runs out."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-md border border-nx-border bg-nx-surface p-4">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <p className="mt-1 text-[14px] text-nx-muted">{text}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t border-nx-border bg-nx-surface">
        <p className="mx-auto max-w-[1100px] px-4 py-4 text-[13px] text-nx-muted sm:px-6">
          Harvard Graduate School of Education · Learning to Lead (LTL) study
        </p>
      </footer>
    </div>
  );
}
