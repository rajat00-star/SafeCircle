import type { Analysis } from "@/lib/api";

type Span = { start: number; end: number; label: string; strong: boolean };

// Renders the user's text with evidence spans marked. Text is rendered as React
// text nodes (never as HTML), so pasted content can't inject markup.
export default function Highlighted({ text, result }: { text: string; result: Analysis }) {
  const spans: Span[] = [];
  for (const c of result.categories) {
    for (const e of c.evidence) {
      if (e.start != null && e.end != null && e.end > e.start) {
        spans.push({ start: e.start, end: e.end, label: c.title, strong: c.weight >= 0.35 });
      }
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      last.strong = last.strong || s.strong;
      if (!last.label.includes(s.label)) last.label += ` · ${s.label}`;
    } else merged.push({ ...s });
  }
  const out: React.ReactNode[] = [];
  let pos = 0;
  merged.forEach((s, i) => {
    if (s.start > pos) out.push(text.slice(pos, s.start));
    out.push(<mark key={i} className={s.strong ? "high" : ""} title={s.label}>{text.slice(s.start, s.end)}</mark>);
    pos = s.end;
  });
  out.push(text.slice(pos));
  return <div className="highlighted" aria-label="Your message with warning signs highlighted">{out}</div>;
}
