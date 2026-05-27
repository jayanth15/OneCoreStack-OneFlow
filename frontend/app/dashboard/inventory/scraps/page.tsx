import { Suspense } from "react";
import InventoryTypePage from "../_components/InventoryTypePage";

export const metadata = { title: "Scraps — Inventory" };

export default function ScrapsPage() {
  return (
    <Suspense>
      <InventoryTypePage
        itemType="scrap"
        label="Scraps"
        description="Scrap materials automatically recorded from production BOM"
        basePath="/dashboard/inventory/scraps"
      />
    </Suspense>
  );
}
