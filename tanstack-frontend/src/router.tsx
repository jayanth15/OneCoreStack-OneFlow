import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import type { QueryClient } from "@tanstack/react-query"
import { routeTree } from "./routeTree.gen"
import { createQueryClient } from "./lib/query-client"

export function getRouter() {
  const queryClient = createQueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })

  // Wraps the app in QueryClientProvider and handles SSR stream/hydrate
  // of TanStack Query caches (route loaders can ensureQueryData).
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
  interface RouterContext {
    queryClient: QueryClient
  }
}
