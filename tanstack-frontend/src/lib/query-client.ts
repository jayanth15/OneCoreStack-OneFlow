import { QueryClient  } from "@tanstack/react-query";
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

export function createQueryClient() {
  return new QueryClient({
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
}
