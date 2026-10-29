/**
 * "/" — no page of its own: signed-out visitors go to the sign-in page
 * (the original first screen, with the Kimanya photograph); signed-in
 * people go straight to their own area.
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getActiveTeams } from "@/lib/db/teams";
import { homePathFor } from "@/lib/teams";

export default async function Root() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const teams = await getActiveTeams(session.user.id);
  redirect(homePathFor(session.user.role, teams));
}
