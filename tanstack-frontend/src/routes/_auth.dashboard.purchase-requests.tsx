import { useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

export const Route = createFileRoute("/_auth/dashboard/purchase-requests")({
  component: PurchaseRequestsLegacyPage,
})

function PurchaseRequestsLegacyPage() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate({ href: "/dashboard/requests?tab=vendor_purchase", replace: true })
  }, [navigate])

  return null
}
