import { redirect } from "next/navigation";

export default function MarketingRequestsLegacyPage() {
  redirect("/dashboard/requests?tab=customer");
}
