// Ring-and-core mark: the same motif as the 3D hero sculpture, drawn as hairlines.
export default function BrandMark({ size = 30, id = "bm-g" }: { size?: number; id?: string }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".5" stopColor="#ae95ff" />
          <stop offset="1" stopColor="#a6dcff" />
        </linearGradient>
      </defs>
      <ellipse cx="16" cy="16" rx="13.5" ry="13.5" fill="none" stroke={`url(#${id})`} strokeWidth="2.2" />
      <ellipse cx="16" cy="16" rx="13.5" ry="5" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1" transform="rotate(-24 16 16)" />
      <circle cx="16" cy="16" r="4.2" fill={`url(#${id})`} />
    </svg>
  );
}
