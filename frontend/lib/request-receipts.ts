import { apiFetchJson } from "@/lib/api";

export interface RequestReceipt {
  id: number;
  sn_no: string;
  request_id: number;
  item_name?: string | null;
  item_code?: string | null;
  quantity_requested: number;
  quantity_received: number;
  notes?: string | null;
  department?: string | null;
  created_by_user_id?: number | null;
  created_by_username?: string | null;
  status: "pending_ack" | "acknowledged";
  acknowledged_by_user_id?: number | null;
  acknowledged_by_username?: string | null;
  acknowledged_at?: string | null;
  acknowledgment_note?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateReceiptPayload {
  request_id: number;
  item_name?: string;
  item_code?: string;
  quantity_requested?: number;
  quantity_received: number;
  notes?: string;
  department?: string;
}

export const requestReceiptsApi = {
  list: (params?: { request_id?: number; status?: string; only_active?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.request_id !== undefined) search.set("request_id", String(params.request_id));
    if (params?.status) search.set("status", params.status);
    if (params?.only_active !== undefined) search.set("only_active", String(params.only_active));
    const qs = search.toString();
    return apiFetchJson<RequestReceipt[]>(`/api/v1/request-receipts${qs ? `?${qs}` : ""}`);
  },

  get: (id: number) =>
    apiFetchJson<RequestReceipt>(`/api/v1/request-receipts/${id}`),

  create: (payload: CreateReceiptPayload) =>
    apiFetchJson<RequestReceipt>("/api/v1/request-receipts", { method: "POST", body: JSON.stringify(payload) }),

  acknowledge: (id: number, note?: string) =>
    apiFetchJson<RequestReceipt>(`/api/v1/request-receipts/${id}/acknowledge`, { method: "POST", body: JSON.stringify({ note }) }),

  delete: (id: number) =>
    apiFetchJson<void>(`/api/v1/request-receipts/${id}`, { method: "DELETE" }),
};
