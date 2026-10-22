"use client";

import { useEffect, useRef, useState } from "react";

type TraceEntry = {
  sql: string;
  ok: boolean;
  rowCount?: number;
  truncated?: boolean;
  error?: string;
};

type ClarifyOption = { label: string; value: string };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  trace?: TraceEntry[];
  error?: boolean;
  clarify?: { options: ClarifyOption[] };
};

const SUGGESTIONS = [
  "How much did the Youth ministry receive and spend this year?",
  "Which ministries are running a deficit?",
  "What's the balance of the General Fund?",
  "Total income vs expenses year to date?",
];

function QueryTrace({ trace }: { trace: TraceEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!trace?.length) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-[10.5px] text-ink3 hover:text-ink2 transition-colors"
      >
        {open ? "▾" : "▸"} {trace.length} quer{trace.length === 1 ? "y" : "ies"} run
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {trace.map((t, i) => (
            <div key={i} className="rounded-lg border border-line bg-bg px-3 py-2">
              <pre className="font-mono text-[10.5px] text-ink2 whitespace-pre-wrap break-words">{t.sql}</pre>
              <div className="font-mono text-[10px] mt-1">
                {t.ok ? (
                  <span className="text-forest">
                    {t.rowCount} row{t.rowCount === 1 ? "" : "s"}
                    {t.truncated ? " (truncated)" : ""}
                  </span>
                ) : (
                  <span className="text-clay">error: {t.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: data.error ?? "Something went wrong.", error: true }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.answer, trace: data.trace, clarify: data.clarify }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : String(e), error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-8 py-6">
        <div className="max-w-[760px] mx-auto flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-4">
              <p className="font-ui text-[13px] text-ink3 mb-3">Try asking:</p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left rounded-xl border border-line bg-panel px-4 py-2.5 font-ui text-[13px] text-ink2 hover:border-forest hover:bg-forest-soft/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="self-end max-w-[80%]">
                <div className="rounded-2xl rounded-br-md bg-forest text-bg px-4 py-2.5 font-ui text-[13.5px] whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="self-start max-w-[85%]">
                <div
                  className={`rounded-2xl rounded-bl-md px-4 py-3 font-ui text-[13.5px] whitespace-pre-wrap ${
                    m.error ? "bg-clay-soft text-ink border border-clay/30" : "bg-panel border border-line text-ink"
                  }`}
                >
                  {m.content}
                </div>
                {m.clarify && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.clarify.options.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => send(opt.value)}
                        disabled={loading}
                        className="rounded-full border border-forest bg-forest-soft/50 px-3.5 py-1.5 font-ui text-[12.5px] font-semibold text-ink hover:bg-forest-soft transition-colors disabled:opacity-50"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {m.trace && <QueryTrace trace={m.trace} />}
              </div>
            ),
          )}

          {loading && (
            <div className="self-start">
              <div className="rounded-2xl rounded-bl-md bg-panel border border-line px-4 py-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-ink3 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-ink3 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-ink3 animate-bounce" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-bg/90 backdrop-blur-sm px-8 py-4 shrink-0">
        <div className="max-w-[760px] mx-auto flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask about the church's finances…"
            className="flex-1 resize-none rounded-2xl border border-line bg-panel px-4 py-3 font-ui text-[13.5px] text-ink placeholder:text-ink3 focus:outline-none focus:border-forest max-h-40"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-2xl bg-forest text-bg font-ui text-[12.5px] font-semibold cursor-pointer disabled:opacity-50 shrink-0"
          >
            Send
          </button>
        </div>
        <p className="max-w-[760px] mx-auto font-ui text-[10.5px] text-ink3 mt-2">
          Answers come from the last synced copy of the Aplos ledger. Verify the SQL under each answer for anything you post.
        </p>
      </div>
    </div>
  );
}
