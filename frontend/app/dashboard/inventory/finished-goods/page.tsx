import { Suspense } from "react";
import InventoryTypePage from "../_components/InventoryTypePage";

export const metadata = { title: "Finished Goods — Inventory" };

export default function FinishedGoodsPage() {
  return (
    <Suspense>
      <InventoryTypePage
        itemType="finished_good"
        label="Finished Goods"
        description="Track finished products ready for dispatch"
        basePath="/dashboard/inventory/finished-goods"
      />
    </Suspense>
  );
}
