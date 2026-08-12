import { createFileRoute } from "@tanstack/react-router"
import { InventoryTypePage } from "@/components/inventory/inventory-type-page"

export const Route = createFileRoute("/_auth/dashboard/inventory/raw-materials")({
  component: RawMaterialsPage,
})

function RawMaterialsPage() {
  return (
    <InventoryTypePage
      itemType="raw_material"
      label="Raw Materials"
      description="Track raw materials and their schedule requirements"
      basePath="/dashboard/inventory/raw-materials"
    />
  )
}
