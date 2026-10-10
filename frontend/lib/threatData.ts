// Geographic threat data for the globe, behind a provider interface.
//
// The SafeCircle backend has no geographic or timestamped threat feed (it never records where a
// check came from), so the default provider is a clearly labelled DEMO: synthetic counts placed at
// real city coordinates. Nothing here is derived from user checks, and nothing is sent anywhere.
// A verified feed can be connected later by implementing ThreatFeedProvider (see LiveFeedProvider).

export const TACTICS = ["urgency", "impersonation", "otp_request", "credential_request", "payment_pressure", "threat"] as const;
export type Tactic = (typeof TACTICS)[number];
export const RANGES = ["24h", "7d", "30d"] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_LABEL: Record<Range, string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };

export type Hotspot = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  /** Report counts per time range and tactic. */
  counts: Record<Range, Partial<Record<Tactic, number>>>;
  /** "confirmed" = observed by a verified source; "unverified" = incomplete or single-source. */
  confidence: "confirmed" | "unverified";
  /** ISO time of the latest report, or null when the source has none (always null in demo mode). */
  lastUpdated: string | null;
};
export type Link = { from: string; to: string; tactic: Tactic };
export type ThreatSnapshot = {
  provider: { id: string; label: string; kind: "demo" | "live"; description: string };
  generatedAt: string | null;
  hotspots: Hotspot[];
  links: Link[];
};
export interface ThreatFeedProvider {
  load(): Promise<ThreatSnapshot>;
}

// ---- Demo provider ---------------------------------------------------------------------------
// Real coordinates of large cities (geographic fact). Counts and links are generated from a fixed
// seed, so the demo is stable between visits, and they do NOT reflect real scam rates or rankings.
const CITIES: [string, string, number, number][] = [
  ["Mumbai", "India", 19.08, 72.88], ["Delhi", "India", 28.61, 77.21], ["Bengaluru", "India", 12.97, 77.59],
  ["Kolkata", "India", 22.57, 88.36], ["Singapore", "Singapore", 1.35, 103.82], ["Jakarta", "Indonesia", -6.21, 106.85],
  ["Manila", "Philippines", 14.6, 120.98], ["Tokyo", "Japan", 35.68, 139.69], ["Seoul", "South Korea", 37.57, 126.98],
  ["Sydney", "Australia", -33.87, 151.21], ["Dubai", "UAE", 25.2, 55.27], ["Lagos", "Nigeria", 6.52, 3.38],
  ["Nairobi", "Kenya", -1.29, 36.82], ["Johannesburg", "South Africa", -26.2, 28.05], ["London", "United Kingdom", 51.51, -0.13],
  ["Paris", "France", 48.86, 2.35], ["Berlin", "Germany", 52.52, 13.4], ["Madrid", "Spain", 40.42, -3.7],
  ["New York", "United States", 40.71, -74.0], ["Toronto", "Canada", 43.65, -79.38], ["Los Angeles", "United States", 34.05, -118.24],
  ["Mexico City", "Mexico", 19.43, -99.13], ["São Paulo", "Brazil", -23.55, -46.63], ["Buenos Aires", "Argentina", -34.6, -58.38],
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DemoProvider implements ThreatFeedProvider {
  async load(): Promise<ThreatSnapshot> {
    const rnd = mulberry32(20261012);
    const hotspots: Hotspot[] = CITIES.map(([name, region, lat, lon], i) => {
      const d30: Partial<Record<Tactic, number>> = {}, d7: Partial<Record<Tactic, number>> = {}, d1: Partial<Record<Tactic, number>> = {};
      const scale = 20 + rnd() * 380;
      for (const t of TACTICS) {
        if (rnd() < 0.3) continue;
        const m = Math.round(scale * (0.2 + rnd()));
        d30[t] = m;
        d7[t] = Math.round(m * (0.18 + rnd() * 0.12));
        d1[t] = Math.round(m * (0.02 + rnd() * 0.03));
      }
      return { id: `demo-${i}`, name, region, lat, lon, counts: { "30d": d30, "7d": d7, "24h": d1 }, confidence: rnd() < 0.65 ? "confirmed" : "unverified", lastUpdated: null };
    });
    const links: Link[] = [];
    for (let i = 0; i < 18; i++) {
      const a = hotspots[Math.floor(rnd() * hotspots.length)], b = hotspots[Math.floor(rnd() * hotspots.length)];
      if (a.id !== b.id) links.push({ from: a.id, to: b.id, tactic: TACTICS[Math.floor(rnd() * TACTICS.length)] });
    }
    return {
      provider: {
        id: "demo", label: "Demo data", kind: "demo",
        description: "Synthetic sample data at real city locations. Illustrative only: it is not a live threat map and does not reflect real scam rates.",
      },
      generatedAt: null, hotspots, links,
    };
  }
}

// ---- Live provider (for a future verified feed) -------------------------------------------
// Expects the ThreatSnapshot JSON shape from a same-origin URL (the site's CSP allows connect-src 'self').
export class LiveFeedProvider implements ThreatFeedProvider {
  constructor(private url: string, private label = "Live feed") {}
  async load(): Promise<ThreatSnapshot> {
    const res = await fetch(this.url, { credentials: "omit" });
    if (!res.ok) throw new Error(`Threat feed returned ${res.status}`);
    const data = (await res.json()) as Partial<ThreatSnapshot>;
    if (!Array.isArray(data.hotspots)) throw new Error("Threat feed has an unexpected shape");
    return {
      provider: { id: "live", label: this.label, kind: "live", description: data.provider?.description ?? "Verified threat feed." },
      generatedAt: data.generatedAt ?? null, hotspots: data.hotspots, links: Array.isArray(data.links) ? data.links : [],
    };
  }
}

export function getThreatProvider(): ThreatFeedProvider {
  const url = process.env.NEXT_PUBLIC_THREAT_FEED_URL;
  return url ? new LiveFeedProvider(url) : new DemoProvider();
}

export const total = (h: Hotspot, range: Range, tactic: Tactic | "all") =>
  tactic === "all" ? Object.values(h.counts[range]).reduce((a, b) => a + (b ?? 0), 0) : h.counts[range][tactic] ?? 0;
