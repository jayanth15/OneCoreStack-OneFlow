---
type: "query"
date: "2026-08-19T16:52:11.393839+00:00"
question: "The problem is still there when i click on edit the url is changing but the page is not rendering on tanstack same for all things in our application, All edit options are not working the url is changing but page or pop or any other things are not working."
contributor: "graphify"
outcome: "useful"
source_nodes: ["tanstack_frontend_src_route_tree_gen", "tanstack_frontend_src_router_getrouter", "tanstack_frontend_src_routes_auth_dashboard_admin_users_userspage", "tanstack_frontend_src_routes_auth_dashboard_admin_users_id_edit_edituserpage"]
---

# Q: The problem is still there when i click on edit the url is changing but the page is not rendering on tanstack same for all things in our application, All edit options are not working the url is changing but page or pop or any other things are not working.

## Answer

Confirmed systemic TanStack routing composition defect. The generated route tree nests edit, new, and detail routes beneath 13 page routes, including users, BOM, departments, inventory, spares, production, schedule, suppliers, and vendors. Those parent page components do not render TanStack Router Outlet, so navigation correctly updates the URL and matches the child route, but the child has nowhere to mount. This is not an admin permission failure. Recommended fix: convert each parent to a layout containing Outlet and move its list/page UI to an index route, or rename replacement child routes with TanStack's non-nested trailing-underscore convention. Do not simply add Outlet to list pages because that can render list and edit UI together. Expanded graph query tokens: route, router, parent, child, edit, navigation, render, users, bom, inventory, processing.

## Outcome

- Signal: useful

## Source Nodes

- tanstack_frontend_src_route_tree_gen
- tanstack_frontend_src_router_getrouter
- tanstack_frontend_src_routes_auth_dashboard_admin_users_userspage
- tanstack_frontend_src_routes_auth_dashboard_admin_users_id_edit_edituserpage