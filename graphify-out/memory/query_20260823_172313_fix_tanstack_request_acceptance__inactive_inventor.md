---
type: "codebase"
date: "2026-08-23T17:23:13.485257+00:00"
question: "Fix TanStack request acceptance, inactive inventory visibility, notifications, wrong request item selection, native error dialogs, and slow dashboard/inventory loading"
contributor: "graphify"
outcome: "useful"
---

# Q: Fix TanStack request acceptance, inactive inventory visibility, notifications, wrong request item selection, native error dialogs, and slow dashboard/inventory loading

## Answer

Fixed systemic URL-string query invalidation so resource mutations refresh query-string lists/details and inventory dashboard aggregates; acceptance now closes the request dialog; Base UI combobox portal clicks commit the exact item object; inactive items are explicitly excluded from request searches; notification refresh handles open/focus/events, races, errors and retry; native alerts are rendered as accessible in-app toasts; inventory landing uses one summary query; backend aggregate queries were collapsed and zero types are returned; inventory list schedule enrichment is scoped to relevant products.

## Outcome

- Signal: useful