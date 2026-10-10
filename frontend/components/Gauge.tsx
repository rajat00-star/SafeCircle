export default function Gauge({ score, level }: { score: number; level: "low" | "medium" | "high" }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = `var(--${level})`;
  return (
    <div className="gauge" role="img" aria-label={`Risk score ${score} out of 100`}>
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 48 48)" />
        <text x="48" y="54" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--text)">{score}</text>
      </svg>
    </div>
  );
}
