import { requireScoringAccess } from "@/lib/auth-helpers";
import { SimpleWeekList } from "@/components/simple/week-list";

export default async function SimpleHome() {
  const { session } = await requireScoringAccess();
  return (
    <SimpleWeekList
      coderId={session.user.id}
      showCalibration={session.user.datasetScope !== "training"}
    />
  );
}
