export function ValleyMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0e1210" />
      <path d="M5 26 L16 6 L27 26 Z" fill="#c6a15a" />
      <path d="M16 13 V26" stroke="#0e1210" strokeWidth="1.7" />
      <path d="M13.5 26 C13.5 21.5 18.5 21.5 18.5 26" fill="#2f6d58" />
      <circle cx="25" cy="7.5" r="1.7" fill="#f3ecdf" />
    </svg>
  );
}

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function TribeBanner({ name }: { name: string }) {
  const h = hue(name);
  const a = h % 3;
  const b = (h >>> 3) % 3;
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
      <path d="M2 1 H12 V12 L7 15 L2 12 Z" fill={b === 0 ? "#c6a15a" : b === 1 ? "#2f6d58" : "#a6533a"} />
      {a === 0 && <path d="M7 3 L10 8 H4 Z" fill="#0e1210" />}
      {a === 1 && <circle cx="7" cy="7" r="2.2" fill="#f3ecdf" />}
      {a === 2 && <path d="M4 5 H10 V9 H4 Z" fill="#0e1210" />}
    </svg>
  );
}
