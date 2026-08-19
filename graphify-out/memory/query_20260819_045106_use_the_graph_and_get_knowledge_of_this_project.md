---
type: "query"
date: "2026-08-19T04:51:06.695400+00:00"
question: "use the graph and get knowledge of this project."
contributor: "graphify"
outcome: "useful"
source_nodes: ["Architecture", "System Architecture", "OneFlow tech stack", "Request", "InventoryItem", "FastAPI", "apiFetchJson()"]
---

# Q: use the graph and get knowledge of this project.

## Answer

Expanded from original query via graph vocabulary: architecture, system, application, component, frontend, backend, service, database, workflow, execution, integration, agent; then fast, react, next, tanstack, tailwind, sqlite, alembic, auth, inventory, production, procurement, logistics; then request, approval, receipt, dispatch, purchase, inventory, production, schedule, bom, stock, grn, notification. OneFlow is a full-stack manufacturing ERP/PWA. Its FastAPI and SQLModel backend serves a React and Next.js frontend through the central apiFetchJson client, with SQLite in development and PostgreSQL in production. Major domains are inventory, requests and receipts, procurement and purchase orders, GRN and dispatch logistics, production planning and job cards, schedules, users, departments, suppliers, notifications, and history. The central business lifecycle connects requests and approval to receipts or procurement, dispatch and GRN, inventory deductions or additions, and acknowledgment and audit history. Production links BOMs, plans, orders, processes, and job cards to raw-material consumption and finished-goods inventory. Core graph hubs are User, Unit, get_session, InventoryItem, apiFetchJson, Schedule, and get_current_user. The graph has 4515 nodes, 11507 edges, 304 communities, and no detected import cycles. It was built from commit 6a8dac12 while current HEAD is 9d1e79a, so recent changes may not be represented.

## Outcome

- Signal: useful

## Source Nodes

- Architecture
- System Architecture
- OneFlow tech stack
- Request
- InventoryItem
- FastAPI
- apiFetchJson()