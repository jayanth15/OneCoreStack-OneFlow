import { redirect } from "next/navigation";

export default function PurchaseRequestsLegacyPage() {
  redirect("/dashboard/requests?tab=internal");
}
