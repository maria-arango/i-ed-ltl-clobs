import { requireSession } from "@/lib/auth-helpers";
import { SimpleWeekList } from "@/components/simple/week-list";

export default async function SimpleHome() {
  const session = await requireSession();
  return (
    <SimpleWeekList
      coderId={session.user.id}
      showCalibration={session.user.datasetScope !== "training"}
    />
  );
}
