const MAP: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  square:    { bg: "bg-ink",          fg: "text-white",  dot: "bg-white",  label: "Square" },
  subsplash: { bg: "bg-sky-soft",     fg: "text-sky",    dot: "bg-sky",    label: "Subsplash" },
  truist:    { bg: "bg-line2",        fg: "text-ink2",   dot: "bg-ink3",   label: "Truist" },
  aplos:     { bg: "bg-forest-soft",  fg: "text-forest", dot: "bg-forest", label: "Aplos" },
  manual:    { bg: "bg-line2",        fg: "text-ink3",   dot: "bg-ink3",   label: "Manual" },
};

export function SourceChip({ src }: { src: string }) {
  const s = MAP[src] ?? MAP.manual;
  return (
    <span className={`inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-full font-ui text-[10.5px] font-semibold ${s.bg} ${s.fg}`}>
      <span className={`w-1.5 h-1.5 rounded-sm ${s.dot}`} />
      {s.label}
    </span>
  );
}
