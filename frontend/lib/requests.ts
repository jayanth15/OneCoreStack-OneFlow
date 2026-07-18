import { apiFetchJson } from "@/lib/api";

export type RequestType = "internal_transfer" | "vendor_purchase" | "customer_dispatch";
export type RequestStatus =
  | "pending" | "approved" | "in_progress" | "awaiting_signoff"
  | "received" | "not_approved" | "cancelled";

export interface RequestItem {
  id?: number;
  inventory_item_id?: number | null;
  item_name?: string | null;
  item_code?: string | null;
  item_type?: string | null;
  description?: string | null;
  quantity: number;
  timeline_days?: number | null;
  department?: string | null;
  department_label?: string | null;
  item_status?: string | null;
  accepted_by_username?: string | null;
  accepted_at?: string | null;
  acceptance_note?: string | null;
}

export interface RequestCustomerDispatch {
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_bought_by?: string | null;
  delivery_type?: "direct" | "transport" | null;
  inventory_type: "weeder" | "attachment";
  item_id?: number | null;
  item_sn_no?: string | null;
  item_description?: string | null;
  quantity: number;
}

export interface RequestHistory {
  id: number;
  changed_by_username?: string | null;
  change_type: string;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  note?: string | null;
  changed_at: string;
}

export interface UnifiedRequest {
  id: number;
  sn_no: string;
  request_type: RequestType;
  from_department?: string | null;
  from_department_label?: string | null;
  department?: string | null;
  department_label?: string | null;
  target_departments?: string[];
  target_department_labels?: string[];
  from_whom?: string | null;
  quantity: number;
  notes?: string | null;
  status: RequestStatus;
  requested_by_user_id?: number | null;
  requested_by_username?: string | null;
  created_at: string;
  updated_at: string;
  reviewed_by_user_id?: number | null;
  reviewed_by_username?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  fulfilled_by_user_id?: number | null;
  fulfilled_by_username?: string | null;
  fulfillment_accepted_at?: string | null;
  fulfillment_note?: string | null;
  delivered_by_user_id?: number | null;
  delivered_by_username?: string | null;
  delivered_at?: string | null;
  delivery_note?: string | null;
  acknowledged_by_user_id?: number | null;
  acknowledged_by_username?: string | null;
  acknowledged_at?: string | null;
  acknowledgment_note?: string | null;
  is_active: boolean;
  items: RequestItem[];
  dispatch: RequestCustomerDispatch | null;
  history: RequestHistory[];
}

export interface RequestListItem {
  id: number;
  sn_no: string;
  request_type: RequestType;
  from_department?: string | null;
  from_department_label?: string | null;
  department?: string | null;
  department_label?: string | null;
  target_departments?: string[];
  target_department_labels?: string[];
  from_whom?: string | null;
  quantity: number;
  status: RequestStatus;
  requested_by_username?: string | null;
  created_at: string;
  is_active: boolean;
  delivered_by_username?: string | null;
  delivered_at?: string | null;
  acknowledged_by_username?: string | null;
  acknowledged_at?: string | null;
}

export interface CreateRequestPayload {
  request_type: RequestType;
  department?: string;
  from_whom?: string;
  notes?: string;
  items: RequestItem[];
  dispatch?: RequestCustomerDispatch;
}

export interface DeliverRequestPayload {
  delivery_note?: string;
  items?: { request_item_id: number; quantity_delivered: number; condition?: string }[];
}

export const requestsApi = {
  list: (params?: {
    request_type?: RequestType;
    status?: RequestStatus;
    department?: string;
    only_active?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.request_type) search.set("request_type", params.request_type);
    if (params?.status) search.set("status", params.status);
    if (params?.department) search.set("department", params.department);
    if (params?.only_active !== undefined) search.set("only_active", String(params.only_active));
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    if (params?.offset !== undefined) search.set("offset", String(params.offset));
    const qs = search.toString();
    return apiFetchJson<RequestListItem[]>(`/api/v1/requests${qs ? `?${qs}` : ""}`);
  },

  get: (id: number) =>
    apiFetchJson<UnifiedRequest>(`/api/v1/requests/${id}`),

  create: (payload: CreateRequestPayload) =>
    apiFetchJson<UnifiedRequest>("/api/v1/requests", { method: "POST", body: JSON.stringify(payload) }),

  update: (id: number, payload: Partial<CreateRequestPayload>) =>
    apiFetchJson<UnifiedRequest>(`/api/v1/requests/${id}`, { method: "PUT", body: JSON.stringify(payload) }),

  delete: (id: number) =>
    apiFetchJson<void>(`/api/v1/requests/${id}`, { method: "DELETE" }),

  review: (id: number, decision: "approve" | "reject", note?: string) =>
    apiFetchJson<UnifiedRequest>(`/api/v1/requests/${id}/review`, { method: "POST", body: JSON.stringify({ decision, note }) }),

  accept: (id: number, department?: string, note?: string) => {
    const search = new URLSearchParams();
    if (department) search.set("department", department);
    if (note) search.set("note", note);
    const qs = search.toString();
    return apiFetchJson<UnifiedRequest>(`/api/v1/requests/${id}/accept${qs ? `?${qs}` : ""}`, { method: "POST" });
  },

  acceptItem: (id: number, item_id: number, decision: "accept" | "reject" = "accept", note?: string) =>
    apiFetchJson<UnifiedRequest>(`/api/v1/requests/${id}/items/accept`, { method: "POST", body: JSON.stringify({ item_id, decision, note }) }),

  setStatus: (id: number, new_status: RequestStatus, note?: string) =>
    apiFetchJson<UnifiedRequest>(`/api/v1/requests/${id}/status`, { method: "POST", body: JSON.stringify({ new_status, note }) }),

  history: (id: number) =>
    apiFetchJson<RequestHistory[]>(`/api/v1/requests/${id}/history`),

  inbox: (params?: { limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    if (params?.offset !== undefined) search.set("offset", String(params.offset));
    const qs = search.toString();
    return apiFetchJson<RequestListItem[]>(`/api/v1/requests/inbox${qs ? `?${qs}` : ""}`);
  },

  deliver: (id: number, payload?: DeliverRequestPayload | string) => {
    const body = typeof payload === "string" ? { delivery_note: payload } : (payload ?? {});
    return apiFetchJson<UnifiedRequest>(`/api/v1/requests/${id}/deliver`, { method: "POST", body: JSON.stringify(body) });
  },

  acknowledgeDelivery: (id: number, acknowledgment_note?: string) =>
    apiFetchJson<UnifiedRequest>(`/api/v1/requests/${id}/acknowledge-delivery`, { method: "POST", body: JSON.stringify({ acknowledgment_note }) }),
};
