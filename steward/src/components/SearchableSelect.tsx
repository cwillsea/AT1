"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableOption = {
  value: number;
  label: string;
  subLabel?: string;
  group?: string;
};

// Click-to-open, type-to-filter dropdown. Replaces native <select> wherever
// the option list is long enough that scrolling-by-letter doesn't cut it
// (Aplos accounts, tags, funds, purposes).
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "— pick —",
  disabled = false,
  className = "",
  allowEmpty = true,
}: {
  value: number;
  onChange: (n: number) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.subLabel?.toLowerCase().includes(q) ?? false));
  }, [options, query]);

  // Reset highlight when filter changes.
  useEffect(() => { setHighlight(0); }, [query, open]);

  // Reset collapsed groups on open; auto-expand groups with matches when filtering.
  useEffect(() => {
    if (!open) { setExpandedGroups(new Set()); return; }
    if (query.trim()) {
      const groupsWithMatches = new Set(filtered.map((o) => o.group ?? "").filter(Boolean));
      setExpandedGroups(groupsWithMatches);
    }
  }, [open, query, filtered]);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Focus the search input when opening.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
        if (dropdownRef.current) {
          const rect = dropdownRef.current.getBoundingClientRect();
          if (rect.bottom > window.innerHeight) {
            dropdownRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }
      });
    } else {
      setQuery("");
    }
  }, [open]);

  const triggerClass = `px-2 py-1 rounded border border-line bg-white font-ui text-[11.5px] text-left cursor-pointer focus:outline-none focus:border-forest disabled:opacity-60 disabled:cursor-not-allowed ${className}`;

  const choose = (v: number) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) choose(opt.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`${triggerClass} w-full flex items-center justify-between gap-1`}
      >
        <span className={selected ? "text-ink truncate" : "text-ink3 truncate"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="text-ink3 text-[10px]">▾</span>
      </button>
      {open && (
        <div ref={dropdownRef} className="absolute z-20 mt-1 w-full min-w-[260px] bg-white border border-line rounded-md shadow-lg overflow-hidden">
          <div className="p-1.5 border-b border-line2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type to filter…"
              className="w-full px-2 py-1 rounded border border-line bg-white font-ui text-[11.5px] text-ink focus:outline-none focus:border-forest"
            />
          </div>
          <div className="max-h-60 overflow-auto">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => choose(0)}
                className={`block w-full text-left px-2.5 py-1.5 font-ui text-[11.5px] text-ink3 italic hover:bg-line2 ${value === 0 ? "bg-line2" : ""}`}
              >
                {placeholder}
              </button>
            )}
            {filtered.length === 0 && (
              <div className="px-2.5 py-2 font-ui text-[11.5px] text-ink3 italic">No matches</div>
            )}
            {(() => {
              const hasGroups = filtered.some((o) => o.group);
              if (!hasGroups) {
                return filtered.map((o, i) => (
                  <button
                    type="button"
                    key={o.value}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(o.value)}
                    className={`block w-full text-left px-2.5 py-1.5 font-ui text-[11.5px] ${i === highlight ? "bg-forest-soft" : ""} ${o.value === value ? "font-semibold text-forest" : "text-ink"}`}
                  >
                    <div className="truncate">{o.label}</div>
                    {o.subLabel && <div className="font-mono text-[10px] text-ink3 truncate">{o.subLabel}</div>}
                  </button>
                ));
              }
              const groups = Array.from(new Set(filtered.map((o) => o.group ?? "")));
              return groups.map((group) => {
                const items = filtered.filter((o) => (o.group ?? "") === group);
                const isExpanded = expandedGroups.has(group);
                return (
                  <div key={group}>
                    {group && (
                      <button
                        type="button"
                        onClick={() => setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group)) next.delete(group); else next.add(group);
                          return next;
                        })}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase bg-line2 border-y border-line2 hover:bg-line cursor-pointer"
                      >
                        <span>{group}</span>
                        <span className="text-[9px]">{isExpanded ? "▴" : "▾"}</span>
                      </button>
                    )}
                    {isExpanded && items.map((o) => {
                      const i = filtered.indexOf(o);
                      return (
                        <button
                          type="button"
                          key={o.value}
                          onMouseEnter={() => setHighlight(i)}
                          onClick={() => choose(o.value)}
                          className={`block w-full text-left px-2.5 py-1.5 font-ui text-[11.5px] ${i === highlight ? "bg-forest-soft" : ""} ${o.value === value ? "font-semibold text-forest" : "text-ink"}`}
                        >
                          <div className="truncate">{o.label}</div>
                          {o.subLabel && <div className="font-mono text-[10px] text-ink3 truncate">{o.subLabel}</div>}
                        </button>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
