import { apiFetchJson } from "@/lib/api";

export type ReceiptStatus = "created" | "signed_off" | "disputed";

export interface ReceiptItem {
  id: number;
  receipt_id: number;
  request_item_id: number;
  inventory_item_id?: number | null;
  item_name?: string | null;
  item_code?: string | null;
  item_type?: string | null;
  unit?: string | null;
  unit_id?: number | null;
  unit_name?: string | null;
  quantity_requested: number;
  quantity_delivered: number;
  quantity_signed_off?: number | null;
  discrepancy_note?: string | null;
  condition?: string | null;
}

export interface Receipt {
  id: number;
  receipt_number: string;
  request_id: number;
  request_sn_no?: string | null;
  request_from_department?: string | null;
  request_from_department_label?: string | null;
  request_target_departments?: string[];
  request_target_department_labels?: string[];
  requested_by_username?: string | null;
  department?: string | null;
  department_label?: string | null;
  created_by_user_id?: number | null;
  created_by_username?: string | null;
  created_at: string;
  signed_off_by_user_id?: number | null;
  signed_off_by_username?: string | null;
  signed_off_at?: string | null;
  disputed_at?: string | null;
  dispute_note?: string | null;
  status: ReceiptStatus;
  notes?: string | null;
  items: ReceiptItem[];
}

export interface CreateReceiptPayload {
  request_id: number;
  items: { request_item_id: number; quantity_delivered: number; condition?: string }[];
  notes?: string;
}

export const receiptsApi = {
  list: (params?: { limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    if (params?.offset !== undefined) search.set("offset", String(params.offset));
    const qs = search.toString();
    return apiFetchJson<Receipt[]>(`/api/v1/receipts${qs ? `?${qs}` : ""}`);
  },

  get: (id: number) =>
    apiFetchJson<Receipt>(`/api/v1/receipts/${id}`),

  create: (payload: CreateReceiptPayload) =>
    apiFetchJson<Receipt>("/api/v1/receipts", { method: "POST", body: JSON.stringify(payload) }),

  signoff: (id: number, notes?: string) =>
    apiFetchJson<Receipt>(`/api/v1/receipts/${id}/signoff`, { method: "POST", body: JSON.stringify({ notes }) }),

  dispute: (id: number, note?: string) =>
    apiFetchJson<Receipt>(`/api/v1/receipts/${id}/dispute`, { method: "POST", body: JSON.stringify({ note }) }),

  listByRequest: (requestId: number) =>
    apiFetchJson<Receipt[]>(`/api/v1/receipts/by-request/${requestId}`),
};
