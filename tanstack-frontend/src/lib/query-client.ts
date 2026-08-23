import { QueryClient } from "@tanstack/react-query";
import type {QueryFunctionContext} from "@tanstack/react-query";
import { apiFetchJson } from "./api";

/**
 * Default query key convention: queryKey = [url, init?]
 *   useQuery({ queryKey: ["/api/v1/inventory"] })
 *   useQuery({ queryKey: ["/api/v1/inventory", { params: ... }] }) // rarely needed
 */
export type QueryKeyWithOptions = readonly [url: string, init?: RequestInit];

export async function defaultQueryFn<T>(context: QueryFunctionContext): Promise<T> {
  const [url, init] = context.queryKey as QueryKeyWithOptions
  return apiFetchJson<T>(url, { ...init, signal: context.signal })
}

/**
 * API queries in this application use the complete URL as the first query-key
 * entry. TanStack's default partial matching cannot connect
 * `["/api/v1/requests"]` to `["/api/v1/requests?page=1"]`, so mutations used
 * to leave paginated/list views stale. Treat an API resource key as a URL
 * prefix, while respecting URL path/query boundaries.
 */
export function apiQueryMatchesPrefix(queryKey: readonly unknown[], prefix: string): boolean {
  const url = queryKey[0]
  return typeof url === "string" && (
    url === prefix ||
    url.startsWith(`${prefix}?`) ||
    url.startsWith(`${prefix}/`)
  )
}

const INVENTORY_API_ROOTS = [
  "/api/v1/inventory",
  "/api/v1/spares",
  "/api/v1/consumables",
  "/api/v1/attachments",
  "/api/v1/weeders",
]

export function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: defaultQueryFn,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  const defaultInvalidate = queryClient.invalidateQueries.bind(queryClient)
  queryClient.invalidateQueries = ((filters, options) => {
    const prefix = filters?.queryKey?.[0]
    if (typeof prefix !== "string" || !prefix.startsWith("/api/") || filters?.exact) {
      return defaultInvalidate(filters, options)
    }

    const callerPredicate = filters?.predicate
    const invalidationPrefixes = INVENTORY_API_ROOTS.some((root) =>
      apiQueryMatchesPrefix([prefix], root),
    )
      ? [prefix, "/api/v1/dashboard"]
      : [prefix]
    return defaultInvalidate({
      ...filters,
      queryKey: undefined,
      predicate: (query) =>
        invalidationPrefixes.some((candidate) => apiQueryMatchesPrefix(query.queryKey, candidate)) &&
        (!callerPredicate || callerPredicate(query)),
    }, options)
  })

  return queryClient
}
