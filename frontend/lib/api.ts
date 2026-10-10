// Typed client for the SafeCircle Guardian API.

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "") + "/api/v1";

export type Evidence = { text: string; start: number | null; end: number | null; rule: string };
export type Category = { code: string; title: string; explanation: string; weight: number; evidence: Evidence[] };
export type UrlSignal = { code: string; title: string; detail: string; weight: number };
export type UrlResult = {
  url: string; hostname: string; registered_domain: string; risk_score: number;
  signals: UrlSignal[]; start: number | null; end: number | null;
};
export type Analysis = {
  kind: "message" | "url";
  risk_score: number;
  risk_level: "low" | "medium" | "high";
  verdict: string;
  categories: Category[];
  combinations: string[];
  urls: UrlResult[];
  ml: { probability: number; top_terms: string[]; model_version: string } | null;
  recommendations: string[];
  redacted_excerpt: string;
  engine_version: string;
  processing_ms: number;
  ai_summary: string | null;
  ai_status: string;
  stored: boolean;
  analysis_id: string | null;
  alert_ticket: string;
};
export type Profile = {
  id: string; display_name: string; created_at: string;
  store_history: boolean; store_excerpts: boolean; retention_days: number;
};
export type Contact = {
  id: string; name: string; relationship_label: string | null; status: string;
  created_at: string; invite_expires_at: string; consented_at: string | null; ended_at: string | null;
  invite_url?: string;
};
export type AnalysisRecord = {
  id: string; created_at: string; kind: string; risk_score: number; risk_level: string;
  categories: string[]; redacted_excerpt: string | null; engine_version: string;
};
export type InviteInfo = {
  requester_name: string; contact_name: string; status: string; invite_expires_at: string;
  what_you_will_receive: string[]; what_you_will_not_receive: string[];
};
export type AlertItem = {
  id: string; created_at: string; risk_score: number; risk_level: string; categories: string[];
  note: string | null; redacted_excerpt: string | null; acknowledged_at: string | null;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const TOKEN_KEY = "safecircle.profileToken";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: profile only lasts for this page */
  }
}

async function request<T>(path: string, init: RequestInit & { guardianToken?: string; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = init.auth === false ? null : getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init.guardianToken) headers["X-Guardian-Token"] = init.guardianToken;
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { ...init, headers: { ...headers, ...(init.headers as object) } });
  } catch {
    throw new ApiError(0, "Can't reach the SafeCircle server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = typeof body.detail === "string" ? body.detail : "Something went wrong";
    if (body.errors?.length) msg = body.errors.map((e: { message: string }) => e.message).join("; ");
    if (res.status === 401 && token && init.auth !== false) setToken(null);
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export const api = {
  analyzeMessage: (text: string, explain_with_ai = false) =>
    request<Analysis>("/analyze/message", { method: "POST", body: JSON.stringify({ text, explain_with_ai }) }),
  // Same analysis without the profile key, so it is never written to anyone's history (used by the landing-page demo).
  analyzeMessageAnonymous: (text: string) =>
    request<Analysis>("/analyze/message", { method: "POST", body: JSON.stringify({ text, explain_with_ai: false }), auth: false }),
  analyzeUrl: (url: string) => request<Analysis>("/analyze/url", { method: "POST", body: JSON.stringify({ url }) }),
  createProfile: (display_name: string) =>
    request<Profile & { token: string }>("/profiles", { method: "POST", body: JSON.stringify({ display_name }), auth: false }),
  me: () => request<Profile>("/profiles/me"),
  updateSettings: (s: Partial<Pick<Profile, "store_history" | "store_excerpts" | "retention_days" | "display_name">>) =>
    request<Profile>("/profiles/me", { method: "PATCH", body: JSON.stringify(s) }),
  exportData: () => request<unknown>("/profiles/me/export"),
  deleteProfile: () => request<void>("/profiles/me", { method: "DELETE" }),
  history: () => request<AnalysisRecord[]>("/analyses"),
  deleteAnalysis: (id: string) => request<void>(`/analyses/${id}`, { method: "DELETE" }),
  clearHistory: () => request<void>("/analyses", { method: "DELETE" }),
  contacts: () => request<Contact[]>("/contacts"),
  addContact: (name: string, relationship_label?: string) =>
    request<Contact & { invite_url: string }>("/contacts", {
      method: "POST", body: JSON.stringify({ name, relationship_label: relationship_label || null }),
    }),
  revokeContact: (id: string) => request<void>(`/contacts/${id}`, { method: "DELETE" }),
  sendAlert: (alert_ticket: string, contact_ids: string[], note: string, include_excerpt: boolean) =>
    request<{ sent_to: string[]; skipped: { contact_id: string; reason: string }[] }>("/alerts", {
      method: "POST", body: JSON.stringify({ alert_ticket, contact_ids, note: note || null, include_excerpt }),
    }),
  inviteInfo: (t: string) => request<InviteInfo>("/guardian/invite", { guardianToken: t, auth: false }),
  acceptInvite: (t: string) => request<InviteInfo>("/guardian/accept", { method: "POST", guardianToken: t, auth: false }),
  declineInvite: (t: string) => request<void>("/guardian/decline", { method: "POST", guardianToken: t, auth: false }),
  inbox: (t: string) =>
    request<{ requester_name: string; contact_name: string; status: string; alerts: AlertItem[] }>("/guardian/alerts", {
      guardianToken: t, auth: false,
    }),
  ack: (t: string, id: string) => request<AlertItem>(`/guardian/alerts/${id}/ack`, { method: "POST", guardianToken: t, auth: false }),
  modelCard: () => request<ModelCard>("/meta/model-card"),
};

export type Metric = { precision: number; recall: number; f1: number; false_positive_rate: number };
export type ModelCard = {
  engine_version: string;
  thresholds: { suspicious: number; high: number };
  tactic_categories: { code: string; title: string; weight: number; explanation: string }[];
  message_model: Record<string, unknown> | null;
  url_model: Record<string, unknown> | null;
  ai_explanations_enabled: boolean;
  evaluation: {
    generated_at: string; messages_dataset: string; urls_dataset: string; n_urls_per_class: number;
    metrics: Record<string, Metric>; latency_message_p50_ms: number; latency_message_p95_ms: number;
    latency_url_p50_ms: number;
  } | null;
};

export const CATEGORY_LABELS: Record<string, string> = {
  urgency: "Urgency", impersonation: "Impersonation", otp_request: "OTP / PIN request",
  credential_request: "Credential request", payment_pressure: "Payment pressure", threat: "Threats",
  secrecy: "Secrecy", reward_lure: "Reward lure", remote_access: "Remote access", family_impersonation: "'New number' family",
  ai_manipulation: "Filter manipulation", obfuscation: "Disguised characters", suspicious_link: "Suspicious link",
};
