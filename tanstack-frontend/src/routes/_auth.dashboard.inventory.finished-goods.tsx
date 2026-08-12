import { createFileRoute } from "@tanstack/react-router"
import { InventoryTypePage } from "@/components/inventory/inventory-type-page"

export const Route = createFileRoute("/_auth/dashboard/inventory/finished-goods")({
  component: FinishedGoodsPage,
})

function FinishedGoodsPage() {
  return (
    <InventoryTypePage
      itemType="finished_good"
      label="Finished Goods"
      description="Final products ready for dispatch"
      basePath="/dashboard/inventory/finished-goods"
    />
  )
}
