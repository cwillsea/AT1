import Anthropic from "@anthropic-ai/sdk";
import { LEDGER_SCHEMA_DOC } from "@/lib/ledger-schema-doc";
import { runLedgerQuery } from "@/lib/ledger-query";
import { ministryFinancials, type MinistryScope } from "@/lib/ministry";

// The model is a single env var so it's trivial to switch (Haiku for testing,
// Sonnet/Opus for more power) without touching code.
const MODEL = process.env.CHAT_MODEL || "claude-haiku-4-5";
const MAX_TOOL_ROUNDS = 6;

const SYSTEM = `You are a financial assistant for a church treasurer and pastor. You answer questions about the church's books by querying a local SQLite mirror of their Aplos accounting data.

${LEDGER_SCHEMA_DOC}

HOW TO ANSWER
- Use the run_sql tool to get real numbers. Never guess or invent figures.
- Prefer the LedgerLineView for most questions.
- For a ministry/tag's received, spent, or net income, ALWAYS use the
  ministry_financials tool — NOT run_sql. It applies the income/expense + sign
  conventions and the sub-tag rollup for you. Pass startDate/endDate for periods
  like "this year" or "last month". If it returns status "needs_scope", the
  ministry has sub-tags and you MUST let the user choose parent-only vs
  rolled-up — relay the choice, do NOT pick one yourself or fall back to run_sql.
- Amounts are stored signed (income negative, expense/asset positive). Compute
  with SUM(); present results as positive dollars with clear labels.
- The reader is not technical. Give a clear, plain-English answer with the key
  numbers formatted as currency (e.g. $3,360.93). Briefly note what you counted.
- If a question is ambiguous (which time period? which fund?), state the
  assumption you made rather than asking, and answer.`;

type TraceEntry = {
  sql: string;
  ok: boolean;
  rowCount?: number;
  truncated?: boolean;
  error?: string;
  rows?: unknown[];
};

const runSqlTool: Anthropic.Tool = {
  name: "run_sql",
  description:
    "Run a single read-only SQLite SELECT against the church ledger and return the rows. Only SELECT/WITH queries are allowed. Do NOT use this for ministry received/spent/net questions — use ministry_financials for those.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "A single read-only SQLite SELECT statement." },
    },
    required: ["query"],
  },
};

const ministryTool: Anthropic.Tool = {
  name: "ministry_financials",
  description:
    "Compute received / spent / net income for a ministry (tag) over an optional date range. Use this for ANY ministry received/spent/net question. It handles the income/expense-only and sign conventions automatically. If the ministry has sub-tags and you do not pass scope, it returns status 'needs_scope' and the user must choose — never guess the scope.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Ministry / tag name, e.g. 'Youth'." },
      scope: {
        type: "string",
        enum: ["parent_only", "rolled_up"],
        description:
          "parent_only = just this tag. rolled_up = this tag plus its sub-tags. Omit unless the user has clearly specified, so the tool can force a clarification.",
      },
      startDate: { type: "string", description: "Inclusive start date YYYY-MM-DD (optional)." },
      endDate: { type: "string", description: "Inclusive end date YYYY-MM-DD (optional)." },
    },
    required: ["name"],
  },
};

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to steward's environment to enable the assistant." },
      { status: 503 },
    );
  }

  let incoming: { messages?: { role: "user" | "assistant"; content: string }[] };
  try {
    incoming = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const history = (incoming.messages ?? []).filter((m) => m.content?.trim());
  if (!history.length) return Response.json({ error: "No message provided." }, { status: 400 });

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const trace: TraceEntry[] = [];
  const today = new Date().toISOString().slice(0, 10);

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        // Stable doc cached; volatile date in a separate trailing block.
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: `Today's date is ${today}. "This year" means Jan 1 of the current year through today.` },
        ],
        tools: [runSqlTool, ministryTool],
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        const answer = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return Response.json({ answer, trace, model: MODEL });
      }

      // Execute each requested query and feed results back.
      messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        if (block.name === "run_sql") {
          const sql = String((block.input as { query?: string })?.query ?? "");
          const result = await runLedgerQuery(sql);
          if (result.ok) {
            trace.push({ sql, ok: true, rowCount: result.rowCount, truncated: result.truncated, rows: result.rows.slice(0, 50) });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({ rowCount: result.rowCount, truncated: result.truncated, rows: result.rows }),
            });
          } else {
            trace.push({ sql, ok: false, error: result.error });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `ERROR: ${result.error}`, is_error: true });
          }
        } else if (block.name === "ministry_financials") {
          const input = (block.input ?? {}) as { name?: string; scope?: MinistryScope; startDate?: string; endDate?: string };
          const r = await ministryFinancials({
            name: String(input.name ?? ""),
            scope: input.scope,
            startDate: input.startDate,
            endDate: input.endDate,
          });

          // CODE-ENFORCED CLARIFY: parent tag with sub-tags and no scope → stop
          // the whole turn and return a button choice. No numbers reach the model.
          if (r.status === "needs_scope") {
            const kids = r.children.map((c) => c.name).join(", ");
            return Response.json({
              answer: `Do you mean **${r.tag.name} only**, or **${r.tag.name} including its sub-ministries** (${kids})?`,
              clarify: {
                options: [
                  { label: `${r.tag.name} only`, value: `${r.tag.name} only — just the parent tag, excluding sub-ministries.` },
                  { label: `Include sub-ministries`, value: `${r.tag.name} including its sub-ministries (${kids}) — rolled up.` },
                ],
              },
              trace,
              model: MODEL,
            });
          }

          trace.push({
            sql: `ministry_financials(${JSON.stringify(input)})`,
            ok: r.status === "ok",
            rowCount: r.status === "ok" ? r.breakdown.length : undefined,
            error: r.status !== "ok" ? r.status : undefined,
          });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(r) });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    return Response.json(
      { answer: "I wasn't able to finish this question within the query limit. Try narrowing it down.", trace, model: MODEL },
      { status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Assistant error: ${msg}`, trace }, { status: 500 });
  }
}
