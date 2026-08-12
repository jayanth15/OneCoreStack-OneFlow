import { createFileRoute } from "@tanstack/react-router"
import { InventoryTypePage } from "@/components/inventory/inventory-type-page"

export const Route = createFileRoute("/_auth/dashboard/inventory/scraps")({
  component: ScrapsPage,
})

function ScrapsPage() {
  return (
    <InventoryTypePage
      itemType="scrap"
      label="Scraps"
      description="Scrap materials automatically recorded from production BOM"
      basePath="/dashboard/inventory/scraps"
    />
  )
}
