import { Suspense } from "react";
import InventoryTypePage from "../_components/InventoryTypePage";

export const metadata = { title: "Raw Materials — Inventory" };

export default function RawMaterialsPage() {
  return (
    <Suspense>
      <InventoryTypePage
        itemType="raw_material"
        label="Raw Materials"
        description="Track raw materials and their schedule requirements"
        basePath="/dashboard/inventory/raw-materials"
      />
    </Suspense>
  );
}
