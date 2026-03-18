import { Suspense } from "react";
import InventoryTypePage from "../_components/InventoryTypePage";

export const metadata = { title: "Semi Finished — Inventory" };

export default function SemiFinishedPage() {
  return (
    <Suspense>
      <InventoryTypePage
        itemType="semi_finished"
        label="Semi Finished"
        description="Track work-in-progress and semi-finished goods"
        basePath="/dashboard/inventory/semi-finished"
      />
    </Suspense>
  );
}
