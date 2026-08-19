---
type: "query"
date: "2026-08-19T05:41:02.747077+00:00"
question: "on the request page when i click on mark delivered as admin getting internal server error if we can get the cause it would be helpful."
contributor: "graphify"
outcome: "useful"
source_nodes: ["deliver_request()", "create_department_receipts_for_request()", "allocate_document_number()", "Receipt", "global_exception_handler()"]
---

# Q: on the request page when i click on mark delivered as admin getting internal server error if we can get the cause it would be helpful.

## Answer

Expanded from original query via graph vocabulary: admin, request, deliver, delivered, delivery, error, status, receipt, inventory, stock, notification, dispatch. The root cause is a database schema mismatch on the deployment snapshot. Mark Delivered calls deliver_request, which creates department receipts and allocates a receipt number. allocate_document_number selects Receipt.receipt_number. The repository deployment database snapshot is at Alembic revision 0016 and its receipt table lacks receipt_number plus the current signoff and dispute fields. This reproduces OperationalError: no such column: receipt.receipt_number, which global_exception_handler masks as HTTP 500 Internal server error. Upgrading a temporary copy from 0016 to 0017 adds the column and receipt number allocation succeeds. The local app database is already at 0017, so the failing deployed database revision and backend traceback should be verified before changing code. No code or real database was modified.

## Outcome

- Signal: useful

## Source Nodes

- deliver_request()
- create_department_receipts_for_request()
- allocate_document_number()
- Receipt
- global_exception_handler()