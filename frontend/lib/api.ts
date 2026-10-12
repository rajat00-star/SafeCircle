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

async function request<T>(path: string, init: RequestInit & { guardianToken?: string; auth?: boolean; contentType?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": init.contentType ?? "application/json" };
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

  // Scam DNA
  cases: () => request<CaseSummary[]>("/cases"),
  createCase: (title: string) => request<CaseDetail>("/cases", { method: "POST", body: JSON.stringify({ title }) }),
  getCase: (id: string) => request<CaseDetail>(`/cases/${encodeURIComponent(id)}`),
  updateCase: (id: string, patch: { title?: string; status?: CaseStatus }) =>
    request<CaseDetail>(`/cases/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCase: (id: string) => request<void>(`/cases/${encodeURIComponent(id)}`, { method: "DELETE" }),
  addEvidence: (id: string, ev: { kind: "message" | "url"; content: string; channel?: string; observed_at?: string | null }) =>
    request<EventAdded>(`/cases/${encodeURIComponent(id)}/events`, { method: "POST", body: JSON.stringify(ev) }),
  removeEvidence: (id: string, eventId: string) =>
    request<CaseDetail>(`/cases/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" }),
  overview: () => request<Overview>("/overview"),

  // Campaign Radar
  campaigns: () => request<CampaignView>("/campaigns"),
  dismissLink: (case_a: string, case_b: string) =>
    request<unknown>("/campaigns/dismissals", { method: "POST", body: JSON.stringify({ case_a, case_b }) }),
  restoreLink: (case_a: string, case_b: string) =>
    request<void>("/campaigns/dismissals", { method: "DELETE", body: JSON.stringify({ case_a, case_b }) }),

  // Forensics
  forensicText: (text: string, case_id?: string | null, channel = "unknown") =>
    request<ForensicsReport>("/forensics/text", { method: "POST", body: JSON.stringify({ text, case_id: case_id || null, channel }) }),
  forensicUrl: (url: string, case_id?: string | null) =>
    request<ForensicsReport>("/forensics/url", { method: "POST", body: JSON.stringify({ url, case_id: case_id || null }) }),
  forensicScreenshot: (file: Blob, case_id?: string | null, channel = "unknown") => {
    const q = new URLSearchParams({ channel });
    if (case_id) q.set("case_id", case_id);
    return request<ForensicsReport>(`/forensics/screenshot?${q}`, { method: "POST", body: file, contentType: file.type || "application/octet-stream" });
  },

  // Demo mode (synthetic DEMO DATA)
  demoScenarios: () => request<{ label: string; scenarios: DemoScenario[] }>("/demo/scenarios", { auth: false }),
  startScenario: (key: string) => request<CaseDetail>(`/demo/scenarios/${encodeURIComponent(key)}/cases`, { method: "POST" }),
  checkScenario: (key: string, caseId: string) =>
    request<{ matches: boolean; problems: string[]; complete: boolean; expected: DemoScenario["expected"] }>(
      `/demo/scenarios/${encodeURIComponent(key)}/check/${encodeURIComponent(caseId)}`),
  loadDemoCampaigns: () => request<{ label: string; cases_created: number }>("/demo/campaigns", { method: "POST" }),
  clearDemo: () => request<void>("/demo/cases", { method: "DELETE" }),

  // UPI Scam Guard
  upiCheck: (input: string, context?: string, case_id?: string | null) =>
    request<UpiCheck>("/upi/check", { method: "POST", body: JSON.stringify({ input, context: context || null, case_id: case_id || null }) }),

  // Evidence report (reviewed in the app, exported by the user; never sent anywhere)
  caseReport: (id: string, opts: ReportOptions) =>
    request<EvidenceReport>(`/cases/${encodeURIComponent(id)}/report?${reportQuery(opts)}`),
  caseReportMarkdown: async (id: string, opts: ReportOptions): Promise<string> => {
    const token = getToken();
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/cases/${encodeURIComponent(id)}/report.md?${reportQuery(opts)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    } catch {
      throw new ApiError(0, "Can't reach the SafeCircle server. Check your connection and try again.");
    }
    if (!res.ok) throw new ApiError(res.status, res.status === 404 ? "Case not found" : "Could not build the report");
    return res.text();
  },

  // Scam Network Graph
  network: (sharedOnly = false) => request<NetworkGraph>(`/network?shared_only=${sharedOnly}`),
};

export type ReportOptions = { include_excerpts: boolean; include_related: boolean };
function reportQuery(o: ReportOptions) {
  return new URLSearchParams({ include_excerpts: String(o.include_excerpts), include_related: String(o.include_related) }).toString();
}

// ---------- UPI Scam Guard ----------
export type UpiSignal = { code: string; title: string; detail: string; basis: "observed" | "heuristic" | "your_cases" };
export type UpiCheck = {
  parsed: { kind: "handle" | "upi_link"; handle_masked: string; psp: string; psp_known: boolean; payee_name: string | null;
    amount: string | null; currency: string | null; note: string | null; link_type: string | null; unknown_params: string[] };
  signals: UpiSignal[];
  case_matches: { case_id: string; title: string; risk_level: Level; is_demo: boolean }[];
  tactics: CaseTactic[]; risk_score: number; risk_level: Level; score_label: string; verdict: string;
  uncertainty: { level: Level; reasons: string[] }; review_required: boolean; recommendations: string[]; primary_action: string;
  limitations: string[]; stored: boolean; retention: string;
  case_update: { case_id: string; event_added: boolean; duplicate: boolean; alert: AlertDecision; change: Change; risk_score: number; risk_level: Level } | null;
};

// ---------- Evidence report ----------
export type EvidenceReport = {
  report_version: number; generated_at: string; generator: string; submission_status: string; content_sha256: string;
  title: string; case_status: string; is_demo: boolean; demo_notice: string | null; created_at: string; updated_at: string;
  assessment: { risk_score: number; risk_level: Level; score_label: string; thresholds: { medium: number; high: number } | null;
    components: { label: string; weight: number; kind: string }[]; stages_observed: string[]; order_note: string | null;
    uncertainty: { level?: string; reasons?: string[] }; review_required: boolean; review_reasons: string[];
    conflicts: string[]; missing_evidence: string[] };
  tactics: { title: string; stage: string; basis: string; severity: number; evidence: string[] }[];
  timeline: { seq: number; kind: string; channel: string; received_at: string | null; received_at_note: string | null; added_at: string;
    source: string; excerpt: string; content_sha256: string; tactics: { title: string; basis: string; evidence: string[] }[];
    links: { url: string; domain: string | null; signals: string[] }[];
    screenshot: { mime: string; size_bytes: number; width: number; height: number; sha256: string; ocr_confidence: number | null } | null;
    data_quality: string | null }[];
  indicators: { domains: string[]; links: string[]; shortened_links: string[]; upi_handles_masked: string[];
    phone_numbers: string | null; claimed_organisations: string[] };
  related_cases: { case_title: string; is_demo: boolean; relation: string; exact: string[]; heuristic: string[]; uncertainty: string }[];
  related_note: string;
  alert_history: { at: string; decision: string; notified: boolean; risk_level: string | null; risk_score: number | null; reason: string | null }[];
  recommendations: string[]; how_to_report: string; excluded_by_design: string[]; options: ReportOptions;
};

// ---------- Scam Network Graph ----------
export type NetNode =
  | { id: string; type: "case"; case_id: string; label: string; risk_level: Level; risk_score: number; is_demo: boolean; tactic_count: number }
  | { id: string; type: "indicator"; kind: "domain" | "short_link" | "upi" | "phone" | "org"; kind_label: string; label: string; note: string; case_count: number };
export type NetEdge = { from: string; to: string; basis: "observed" | "inferred"; label: string; relation?: string; strength?: number; uncertainty?: string };
export type NetworkGraph = {
  nodes: NetNode[]; edges: NetEdge[];
  stats: { cases: number; indicators: number; shared_indicators: number; observed_edges: number; inferred_edges: number };
  dismissed_pairs: string[]; legend: { observed: string; inferred: string }; source: string;
};

// ---------- Scam DNA types ----------
export type Level = "low" | "medium" | "high";
export type CaseStatus = "open" | "review" | "closed";
export type TacticEvidence = { event_id: string; seq: number | null; text: string };
export type CaseTactic = {
  code: string; title: string; stage: string; severity: number; first_event: string; first_position: number;
  events: string[]; evidence: TacticEvidence[]; basis: "observed" | "inferred"; source: string;
};
export type ChainNode = {
  id: string; type: "event" | "tactic"; label: string; basis: "observed" | "inferred";
  // event
  event_id?: string; position?: number; seq?: number; kind?: string; channel?: string; observed_at?: string | null;
  excerpt?: string; signals?: string[]; event_score?: number; data_quality?: string;
  // tactic
  code?: string; stage?: string; stage_title?: string; severity?: number; evidence?: TacticEvidence[];
  explanation?: string; recommendation?: string; source?: string; confidence?: string;
};
export type ChainEdge = { from: string; to: string; kind: "sequence" | "evidence" | "progression"; basis: string; note: string };
export type Stage = { code: string; title: string; order: number; description: string };
export type Assessment = {
  risk_score: number; risk_level: Level; score_label: string; thresholds: { medium: number; high: number };
  components: { label: string; weight: number; kind: string }[]; mitigations?: string[];
  tactics: CaseTactic[]; stages_observed: string[];
  order: { basis: string; known: boolean; note: string; sequence: string[] };
  chain: { nodes: ChainNode[]; edges: ChainEdge[]; stages: Stage[] };
  uncertainty: { level: Level; reasons: string[] }; review_required: boolean; review_reasons: string[];
  data_quality: { level: string; notes: string[] }; model_signal: { max_probability: number; note: string } | null;
  missing_evidence: string[]; conflicts: string[]; recommendations: string[]; primary_action: string;
  indicators: Record<string, string[]>; event_count: number; fingerprint: string;
};
export type Change = {
  score_before: number; score_after: number; delta: number; level_before: string; level_after: string;
  added_tactics: { code: string; title: string; severity: number }[]; removed_tactics: { code: string; title: string }[];
  stages_added: string[]; explanation: string[]; changed: boolean;
};
export type DetectedTactic = { code: string; title: string; stage: string; severity: number; basis: string; evidence: { text: string; rule: string }[] };
export type CaseEvent = {
  id: string; seq: number; kind: "message" | "url" | "screenshot"; channel: string; source: string;
  observed_at: string | null; created_at: string; excerpt: string;
  media: { mime: string; size_bytes: number; width: number; height: number; sha256: string; ocr_status: string; ocr_confidence: number | null } | null;
  detection: { tactics: DetectedTactic[]; event_score: number; urls: UrlResult[]; ml_probability: number | null;
    safety_advice: string[]; claimed_orgs: string[]; data_quality: { level: string; notes: string[] } };
};
export type CaseLog = {
  id: number; at: string; action: string; alert_action: string | null; notify: boolean;
  risk_level: string | null; risk_score: number | null; detail: Record<string, unknown> | null;
};
export type CaseSummary = {
  id: string; title: string; status: CaseStatus; is_demo: boolean; demo_scenario: string | null;
  created_at: string; updated_at: string; risk_score: number; risk_level: Level; review_required: boolean;
  event_count: number; stages: string[];
};
export type CaseDetail = CaseSummary & { events: CaseEvent[]; assessment: Assessment | null; last_change: Change | null; log: CaseLog[] };
export type AlertDecision = { action: "new" | "escalated" | "updated" | "deescalated" | "suppressed" | "none"; notify: boolean; reason: string };
export type EventAdded = { event: CaseEvent | null; duplicate_of: string | null; alert: AlertDecision; change: Change; case: CaseDetail };
export type Split = { total: number; demo: number };
export type Overview = {
  source: string; investigations: Split; evidence_items: number; open_cases: Split; review_required: Split; high_risk: Split;
  campaigns: Split; alerts_raised: Split; duplicates_suppressed: Split;
  recent_activity: { case_id: string; case_title: string; is_demo: boolean; at: string; action: string;
    alert_action: string | null; risk_level: string | null; risk_score: number | null; reason: string | null }[];
};
export type IndicatorMatch = { type: string; label: string; value: string; basis: "exact" | "heuristic"; weight: number };
export type CampaignLink = { pair: string; a: string; b: string; strength: number; relation: "strong" | "likely" | "possible";
  exact: IndicatorMatch[]; heuristic: IndicatorMatch[]; uncertainty: string };
export type Campaign = {
  id: string; label: string; member_ids: string[];
  members: { id: string; title: string; risk_level: Level; risk_score: number; is_demo: boolean }[];
  links: CampaignLink[]; exact_indicators: string[]; heuristic_indicators: string[]; common_tactics: string[];
  confidence: string; is_demo: boolean; external_matches: unknown[]; disclaimer: string;
};
export type CampaignView = {
  campaigns: Campaign[]; uncertain_links: CampaignLink[]; dismissed_links: CampaignLink[];
  cases_considered: number; cases_excluded_low_risk: number; method: string; external_sources: string[]; external_note: string;
};
export type ForensicsReport = {
  report_id: string; input_kind: "message" | "conversation" | "url" | "screenshot";
  analysis_status: "completed" | "partial" | "unavailable"; status_detail: string;
  original: Record<string, string | number | null>; extracted_text: string | null;
  ocr: { status: string; engine: string; mean_confidence: number | null; word_count: number; detail: string; notes: string[] } | null;
  tactics: CaseTactic[]; url_indicators: { url: string; registered_domain: string; risk_score: number; signals: { code: string; title: string; detail: string }[] }[];
  risk_score: number; risk_level: Level; score_label: string; uncertainty: { level: Level; reasons: string[] };
  review_required: boolean; data_quality: { level: string; notes: string[] }; model_signal: { max_probability: number; note: string } | null;
  recommendations: string[]; primary_action: string; missing_evidence: string[]; conflicts: string[];
  case_id: string | null; case_update: { case_id: string; events_added: number; duplicates: number; alert: AlertDecision; change: Change;
    risk_score: number; risk_level: Level } | null; stored: boolean;
};
export type DemoScenario = {
  key: string; title: string; summary: string;
  expected: { risk_level: Level; review_required: boolean; tactics_include: string[]; tactics_exclude?: string[] };
  events: { kind: "message" | "url"; channel: string; note: string; content: string }[];
};

export const STAGE_TITLES: Record<string, string> = {
  hook: "Approach", pressure: "Pressure", harvest: "Harvest", control: "Control", extraction: "Extraction", evasion: "Evasion",
};
export const CHANNEL_LABELS: Record<string, string> = {
  unknown: "Not specified", sms: "SMS", whatsapp: "WhatsApp", email: "Email", call: "Phone call", upi_app: "UPI app",
  browser: "Browser", social: "Social media", other: "Other",
};
export const ALERT_LABELS: Record<string, string> = {
  new: "Alert raised", escalated: "Alert escalated", updated: "Alert updated", deescalated: "Risk fell (no alert)",
  suppressed: "Alert suppressed", none: "No alert",
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

// The API stores UTC; SQLite returns timestamps without an offset, so treat those as UTC.
export function parseTime(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
}
