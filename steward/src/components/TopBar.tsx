"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ConnectorStatus = {
  connected: boolean;
  lastSyncAt: string | null;
  counts?: { accounts: number; funds: number; tags: number };
  lastFetchedThrough?: string | null;
};

type StatusResp = {
  aplos: ConnectorStatus;
  square: ConnectorStatus;
  bank: ConnectorStatus;
  subsplash: ConnectorStatus;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function Pill({
  label,
  status,
  detail,
  disabled,
}: {
  label: string;
  status: ConnectorStatus;
  detail?: string;
  disabled?: boolean;
}) {
  const dotClass = disabled
    ? "bg-ink3/40"
    : status.connected
      ? "bg-forest"
      : "bg-honey";
  const textClass = disabled ? "text-ink3" : "text-ink2";
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-panel border border-line ${disabled ? "opacity-60" : ""}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      <span className={`font-ui text-[11.5px] font-semibold ${textClass}`}>{label}</span>
      <span className="font-mono text-[10px] text-ink3">
        {disabled ? "not connected" : detail ?? timeAgo(status.lastSyncAt)}
      </span>
    </div>
  );
}

export function TopBar() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const res = await fetch("/api/sync/status", { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("Syncing…");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      const parts: string[] = [];
      if (data.aplos) parts.push(`Aplos: ${data.aplos.accounts} accounts, ${data.aplos.funds} funds, ${data.aplos.tags} tags, ${data.aplos.purposes ?? 0} purposes`);
      if (data.square) {
        if (data.square.skipped) parts.push(`Square: up to date through ${data.square.endDate}`);
        else parts.push(`Square: ${data.square.rowCount} new rows (${data.square.beginDate} → ${data.square.endDate})`);
      }
      const errs = Object.entries(data.errors ?? {}) as [string, string][];
      if (errs.length) parts.push(`Errors — ${errs.map(([k, v]) => `${k}: ${v}`).join("; ")}`);
      setSyncMsg(parts.join(" · "));
      await loadStatus();
      router.refresh();
    } catch (e) {
      setSyncMsg(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="border-b border-line bg-bg/90 backdrop-blur-sm px-8 py-3 flex items-center justify-between gap-4 sticky top-0 z-10">
      <div className="flex items-center gap-2 flex-wrap">
        <Pill label="Aplos" status={status?.aplos ?? { connected: false, lastSyncAt: null }} />
        <Pill
          label="Square"
          status={status?.square ?? { connected: false, lastSyncAt: null }}
          detail={status?.square.lastFetchedThrough ? `through ${status.square.lastFetchedThrough}` : undefined}
        />
        <Pill label="Bank" status={{ connected: false, lastSyncAt: null }} disabled />
        <Pill label="Subsplash" status={{ connected: false, lastSyncAt: null }} disabled />
      </div>
      <div className="flex items-center gap-3">
        {syncMsg && (
          <span className="font-ui text-[11px] text-ink3 max-w-[420px] truncate" title={syncMsg}>
            {syncMsg}
          </span>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 rounded-full bg-forest text-bg font-ui text-[12px] font-semibold cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
        >
          {syncing && (
            <svg
              className="w-3.5 h-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path
                d="M22 12a10 10 0 0 1-10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          )}
          {syncing ? "Syncing…" : "Sync data"}
        </button>
      </div>
    </div>
  );
}
