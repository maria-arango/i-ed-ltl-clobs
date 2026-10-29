/** /account — change your own sign-in PIN (ADR 0003). */
import { requireSession } from "@/lib/auth-helpers";
import { NxCard, NxPageTitle } from "@/components/narratives/nx-ui";
import { ChangePinForm } from "./change-pin-form";

export default async function AccountPage() {
  const session = await requireSession();
  return (
    <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6">
      <NxPageTitle sub={`Signed in as ${session.user.name || session.user.email}`}>Your PIN</NxPageTitle>
      <NxCard className="p-5">
        <ChangePinForm />
      </NxCard>
    </main>
  );
}
