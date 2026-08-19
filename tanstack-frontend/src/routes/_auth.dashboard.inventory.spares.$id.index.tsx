import { useEffect } from "react"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_auth/dashboard/inventory/spares/$id/")({
  component: RedirectToSpares,
})

/** The per-category detail page is no longer needed.
 *  Items are now shown inline in the expandable table on /spares. */
function RedirectToSpares() {
  const navigate = Route.useNavigate()
  useEffect(() => {
    navigate({ href: "/dashboard/inventory/spares", replace: true })
  }, [navigate])
  return null
}
