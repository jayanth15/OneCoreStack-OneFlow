import { createFileRoute } from "@tanstack/react-router"
import { InventoryTypePage } from "@/components/inventory/inventory-type-page"

export const Route = createFileRoute("/_auth/dashboard/inventory/semi-finished")({
  component: SemiFinishedPage,
})

function SemiFinishedPage() {
  return (
    <InventoryTypePage
      itemType="semi_finished"
      label="Semi Finished"
      description="Work-in-progress goods"
      basePath="/dashboard/inventory/semi-finished"
    />
  )
}
