import { describe, expect, it } from "vitest"

import { apiQueryMatchesPrefix, createQueryClient } from "./query-client"

describe("API query invalidation", () => {
  it("matches resource lists, query strings, and detail routes only", () => {
    expect(apiQueryMatchesPrefix(["/api/v1/requests?page=2"], "/api/v1/requests")).toBe(true)
    expect(apiQueryMatchesPrefix(["/api/v1/requests/21"], "/api/v1/requests")).toBe(true)
    expect(apiQueryMatchesPrefix(["/api/v1/requests"], "/api/v1/requests")).toBe(true)
    expect(apiQueryMatchesPrefix(["/api/v1/requests-archive"], "/api/v1/requests")).toBe(false)
  })

  it("invalidates every cached URL beneath an API resource", async () => {
    const client = createQueryClient()
    client.setQueryData(["/api/v1/inventory?page=1&include_inactive=false"], { page: 1 })
    client.setQueryData(["/api/v1/inventory/8"], { id: 8 })
    client.setQueryData(["/api/v1/dashboard/inventory-summary"], { count: 8 })
    client.setQueryData(["/api/v1/requests?page=1"], { untouched: true })

    await client.invalidateQueries({ queryKey: ["/api/v1/inventory"], refetchType: "none" })

    expect(client.getQueryState(["/api/v1/inventory?page=1&include_inactive=false"])?.isInvalidated).toBe(true)
    expect(client.getQueryState(["/api/v1/inventory/8"])?.isInvalidated).toBe(true)
    expect(client.getQueryState(["/api/v1/dashboard/inventory-summary"])?.isInvalidated).toBe(true)
    expect(client.getQueryState(["/api/v1/requests?page=1"])?.isInvalidated).toBe(false)
  })
})
