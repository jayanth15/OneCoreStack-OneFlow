---
type: "query"
date: "2026-08-19T06:08:05.495097+00:00"
question: "ok now can you audit the codebase the admin user raised concern that they also had limited permission on some places on the application, admin should be able to anything, they are saying they were not able to edit users, in normal frontend we are able to do all the things in tanstack-frontend we are getting this problem, like printing, editing bom all these things are not working in tanstack-frontend please validate cause we are migrating the codebase from nextjs to tanstack and we did that. Throughly validate the tanstack-frontend."
contributor: "graphify"
outcome: "useful"
source_nodes: ["tanstack_frontend_src_lib_user_isadminorabove", "tanstack_frontend_src_routes_auth_dashboard_admin_users_userspage", "tanstack_frontend_src_routes_auth_dashboard_admin_users_id_edit_edituserpage", "tanstack_frontend_src_lib_print_report_openprintwindow", "backend_app_routers_bom_update_bom_item", "backend_app_dependencies_auth_require_admin", "tanstack_frontend_src_route_tree_gen"]
---

# Q: ok now can you audit the codebase the admin user raised concern that they also had limited permission on some places on the application, admin should be able to anything, they are saying they were not able to edit users, in normal frontend we are able to do all the things in tanstack-frontend we are getting this problem, like printing, editing bom all these things are not working in tanstack-frontend please validate cause we are migrating the codebase from nextjs to tanstack and we did that. Throughly validate the tanstack-frontend.

## Answer

Audit found backend and shared TanStack permission helpers correctly bypass restrictions for admin and super_admin. Confirmed migration defects: user edit masks API errors by catching err but reading the submit event e; editing a super_admin submits role super_admin although backend update validation rejects that role; 15 async print flows fetch before calling window.open and can be popup-blocked; live job-card add/edit links target two routes absent from the generated TanStack route tree, hidden by dynTo; BOM UI accepts semi_finished inputs rejected by backend and backend cannot clear nullable BOM fields. TanStack build, typecheck and lint pass, but npm test fails because there are no frontend tests.

## Outcome

- Signal: useful

## Source Nodes

- tanstack_frontend_src_lib_user_isadminorabove
- tanstack_frontend_src_routes_auth_dashboard_admin_users_userspage
- tanstack_frontend_src_routes_auth_dashboard_admin_users_id_edit_edituserpage
- tanstack_frontend_src_lib_print_report_openprintwindow
- backend_app_routers_bom_update_bom_item
- backend_app_dependencies_auth_require_admin
- tanstack_frontend_src_route_tree_gen