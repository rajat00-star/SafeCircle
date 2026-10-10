// Shared editorial header for inner pages: index label, oversized caps title, lead copy.
export default function PageHeader({ index, eyebrow, title, lead, aside }:
  { index: string; eyebrow: string; title: string; lead: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <span className="eyebrow fade-up">{eyebrow}</span>
        <h1 className="glow">
          {title.split("\n").map((line, i) => (
            <span className="line" key={i} style={{ display: "block", overflow: "hidden" }}>
              <span className="rise" style={{ display: "inline-block", ["--d" as string]: 80 + i * 120 }}>{line}</span>
            </span>
          ))}
        </h1>
        <p className="lead fade-up" style={{ ["--d" as string]: 300 }}>{lead}</p>
      </div>
      <div className="index fade-up" style={{ ["--d" as string]: 400 }}>{aside ?? <>{index}<br />SAFECIRCLE / GUARDIAN</>}</div>
    </header>
  );
}
