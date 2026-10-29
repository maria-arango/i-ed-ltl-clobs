/** /account — change your own 4-digit sign-in code (ADR 0003). */
import { requireSession } from "@/lib/auth-helpers";
import { NxCard, NxPageTitle } from "@/components/narratives/nx-ui";
import { ChangePinForm } from "./change-pin-form";

export default async function AccountPage() {
  const session = await requireSession();
  return (
    <div className="max-w-[560px] space-y-6">
      <NxPageTitle sub={`Signed in as ${session.user.name || session.user.email}`}>Your sign-in code</NxPageTitle>
      <NxCard className="p-6">
        <ChangePinForm />
      </NxCard>
    </div>
  );
}
