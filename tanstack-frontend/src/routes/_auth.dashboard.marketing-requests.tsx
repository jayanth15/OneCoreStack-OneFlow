import { useEffect } from "react"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_auth/dashboard/marketing-requests")({
  component: MarketingRequestsLegacyPage,
})

function MarketingRequestsLegacyPage() {
  const navigate = Route.useNavigate()

  useEffect(() => {
    navigate({ href: "/dashboard/requests?tab=customer", replace: true })
  }, [navigate])

  return null
}
