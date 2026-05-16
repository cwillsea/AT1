# Claude context — `at1/` (After The One Treasury)

A church treasury hub. Sits between four data sources (Aplos books, Square POS, Subsplash giving, Truist bank) and helps the treasurer post the right entries to Aplos without manually rebuilding splits every week.

## Repo layout

```
at1/
├── aplos/         Node ESM scripts hitting the Aplos REST API (auth + transactions + lookups)
├── square/        Node ESM script + `deposits/` CSV exports from Square Payouts API
├── subsplash/     `transfers/` folder for gifts-*.csv and payments-*.csv (no API yet — see Subsplash notes)
└── steward/       Next.js 16 + Prisma 7 + SQLite app — the UI + orchestration layer
```

**Sibling folders are the raw integrations.** They keep working as CLI scripts independently of `steward/`. Don't move them inside steward — `steward/` imports them via relative paths or spawns them as subprocesses.

## The mental model (read this first)

**Source → Bank → Book** is the design's organizing metaphor, but for v1 we're **deliberately ignoring Bank** and modeling **Source → Aplos** only:

- A *deposit* is a single bank transaction (Square payout, Subsplash transfer, etc.) that bundles many small itemized line items
- A *split entry* in Aplos is the multi-line transaction that breaks the deposit back out by income account / fund / ministry
- The UI shows each deposit as a **card** with rolled-up split lines so the treasurer can review then click Post

In the steward UI: **`/imports` = Square**, **`/subsplash` = Subsplash**. The TopBar's **Sync data** button fetches new Square + Aplos data. Subsplash uses CSV upload (drag-drop or click).

## Stack — `steward/`

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 (App Router) + TypeScript** | One project for UI + backend. Beware breaking changes — see `steward/AGENTS.md` and check `node_modules/next/dist/docs/` before writing new Next code. |
| Styling | **Tailwind CSS v4** (CSS-first config) | Design tokens live in `src/app/globals.css` under `@theme` — no `tailwind.config.ts` file |
| Database | **SQLite via Prisma 7** with `@prisma/adapter-better-sqlite3` | Local-only for now. Postgres is a one-line provider swap in `schema.prisma` when going remote. |
| Auth | None | Local-only `localhost:3000`. Add NextAuth + Google when going remote. |
| Fonts | Manrope (UI), Newsreader (display numerals), JetBrains Mono (tabular) | Via `next/font/google` in `src/app/layout.tsx` |

## Data model (`steward/prisma/schema.prisma`)

| Table | Purpose | Source of truth |
|---|---|---|
| `Account`, `Fund`, `Tag`, `Purpose` | **Cached read-only** Aplos chart-of-accounts data | Aplos API (refreshed by sync) |
| `CategorizationRule` | User-edited rules mapping CSV line items → Aplos posting targets | UI (`/rules` page) |
| `SyncState` | Watermark per source — `lastFetchedThrough` date for incremental sync | sync routes |
| `ManualMark` | User flag: "I posted this card to Aplos manually" — moves card to shelf | `/api/manual-mark` |
| `DeletedDeposit` | Soft-delete flag — hides card from view (dev affordance, remove later) | `/api/delete-deposit` |
| `PostingLog` | Idempotency + audit when real API posting is wired (not in use yet) | future `/api/aplos/post` |

`CategorizationRule.source` distinguishes flavors:
- `"square"` — regex `pattern` matched against description → `accountNumber + fundId + tagId`
- `"subsplash-gift"` — exact match on Subsplash `Fund` value → `purposeId` (Aplos purpose auto-derives account+fund)
- `"subsplash-payment"` — exact match on Subsplash `Payment source` value → `accountNumber + fundId + tagId`

## Component / route map

```
src/app/
├── layout.tsx                 Shell (Sidebar + TopBar)
├── page.tsx                   redirect → /imports
├── imports/page.tsx           Square Imports (server component, reads ../square/deposits/*.csv)
├── subsplash/page.tsx         Subsplash Imports (server component, reads ../subsplash/transfers/*.csv)
├── rules/page.tsx             Tabbed rules editor (Square | Subsplash)
└── api/
    ├── sync/route.ts          POST → runs aplos + square syncs
    ├── sync/status/route.ts   GET  → connector last-sync info for TopBar pills
    ├── subsplash/upload/      POST multipart, accepts .csv or .zip → writes to ../subsplash/transfers/
    ├── rules/                 GET + POST + PATCH/DELETE [id]
    ├── manual-mark/route.ts   POST { externalKey, marked }
    └── delete-deposit/route.ts POST { externalKey, deleted }

src/components/
├── Sidebar.tsx, TopBar.tsx
├── PayoutCard.tsx             Square card (controlled manuallyPosted prop)
├── SubsplashCard.tsx          Subsplash card (gifts + payments sections)
├── DepositList.tsx            Wraps PayoutCard list — splits pending vs PostedShelf
├── TransferList.tsx           Wraps SubsplashCard list — same shelf pattern
├── PostedShelf.tsx            Reusable collapsible "Previously posted" container
├── FlowDiagram.tsx            Square→Aplos 2-lane (NO bank lane in v1)
├── SourceChip.tsx             Branded pill for square/subsplash/aplos/truist/manual
├── SubsplashUploader.tsx      Drop-zone + multipart upload
├── RulesTabs.tsx              Tab switcher between RulesEditor and SubsplashRulesEditor
├── RulesEditor.tsx            Square rules CRUD (regex pattern + account/fund/tag)
└── SubsplashRulesEditor.tsx   Two sections: gift-funds → purpose, payment-sources → account/fund/tag

src/lib/
├── db.ts                      Prisma client singleton (uses globalThis cache for dev HMR)
├── fmt.ts                     fmtUSD, fmtShortDate
├── aplos-auth.ts              In-process port of aplos/auth.js (reads ../aplos/.env)
├── aplos-sync.ts              Pulls /accounts, /funds, /tags, /purposes → upserts cache tables
├── aplos-lookup.ts            One-shot DB → Map for cheap name lookups per page render
├── square-csv.ts              Parses all CSVs in ../square/deposits/, classifies rows by Rule[]
├── square-sync.ts             Spawns node ../square/index.js with computed BEGIN/END_DATE env
└── subsplash-csv.ts           Parses gifts-*.csv + payments-*.csv, groups by Transfer ID
```

## Hard-won gotchas (real bugs we hit — don't repeat)

1. **Prisma 7 needs an explicit adapter.** `new PrismaClient()` alone throws. Use `new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "dev.db" }) })`. Note the class name is `PrismaBetterSqlite3` (lowercase `qlite`), not `PrismaBetterSQLite3`.

2. **`server-only` package throws at runtime outside Next.js.** Don't add `import "server-only"` to files that are also imported by CLI scripts via `tsx`. Either omit it or use the import only in files reachable solely from Next routes.

3. **Aplos's `auth.js` has top-level await inside an `if (import.meta.url === ...)` self-test.** `tsx` can't compile it. That's why we have `steward/src/lib/aplos-auth.ts` — a 30-line in-TS reimplementation. Don't try to `import { getAccessToken } from "../../../aplos/auth.js"` from anywhere in steward.

4. **Aplos refuses destructive operations when invoked by an AI.** `npx prisma migrate reset` will print an error citing "Claude Code" and refuse. Use `npx prisma migrate deploy` instead — it only applies pending migrations, never resets. (This is a Prisma anti-foot-shooting guard, not an Aplos issue — apologies for the confusing earlier subject.)

5. **Next.js 16 dev daemon caches the Prisma client across schema changes.** After `prisma migrate dev` + `prisma generate`, the running dev server will throw `Cannot read properties of undefined (reading 'findMany')` for the new model. Fix: kill the node processes + `rm -rf .next` + restart `npm run dev`. There's no graceful HMR for this.

6. **`prisma migrate dev` in Next 16 / Prisma 7 puts the SQLite file at `steward/dev.db`** (not `steward/prisma/dev.db`) because `prisma.config.ts` resolves `DATABASE_URL` from project root. Match this in any adapter URL.

7. **Don't synthesize Aplos names.** The previous "Coffee bar" / "Merch" labels were wrong — Aplos's real account names are "Food & Coffee Sales" / "Merchandise Sales". Always look up via `aplos-lookup.ts` instead of hardcoding.

8. **`px-[18px]` is intentional** even though Tailwind v4 supports `px-4.5`. The design prototype uses literal pixel values for fidelity — keep them as arbitrary values. Ignore IDE warnings about canonical classes.

9. **Subsplash has no free API.** Their developer site is gated behind a sales call. CSV download is the current path. If we ever automate it, do Playwright (cheap) not Chrome MCP via Claude (expensive). See conversation history for cost analysis.

10. **Bash `cd` persistence is real.** The Bash tool keeps cwd across calls. After `cd steward && X`, subsequent calls are already in `steward/`. Don't `cd` again or you'll get "directory not found."

## Conventions (preferred patterns)

- **Server components fetch from DB + filesystem; pass typed data to client components.** Don't put `prisma` imports in `"use client"` files.
- **Cards are controlled.** `manuallyPosted` and similar state lives in the parent list, not the card itself. Cards take props + callbacks.
- **Optimistic UI with rollback on failure.** All mark/delete actions update local state immediately, POST in background, revert on error.
- **`dynamic = "force-dynamic"`** on pages that need fresh DB reads. Rules cascade because of this — edits show up on the next /imports render.
- **Honest fallback labels.** When name lookup fails, show `Account 0` / `Fund 0` / `Tag 0` so missing data is visible, not a synthesized "Account ?" that hides the gap.
- **Soft-delete and shelf instead of hard-hide.** Even for the dev-only Delete button, persist to DB so the user could recover. Same idea for ManualMark.

## Running it

```
# From at1/
cd steward
npm install
npx prisma migrate deploy        # apply migrations to dev.db
npx tsx scripts/sync-aplos.ts    # populate Account/Fund/Tag/Purpose tables (needs ../aplos/.env + private key)
npx tsx scripts/seed-rules.ts    # seed initial Square rules (idempotent)
npm run dev                      # localhost:3000
```

Sync new data live: click **Sync data** button in TopBar — runs Aplos + Square sync (Subsplash is upload-only).

## What's intentionally NOT built yet

- Real Aplos posting. The "Post → Aplos" buttons are deliberately disabled with a tooltip explaining the API isn't wired. Use the "Manually posted" checkbox as the substitute for now.
- Subsplash sync (no API). Users upload CSVs they download from `https://wallet.subsplash.com/transfers`.
- Auth / multi-user. Single-user local app.
- Bank reconciliation (Truist). The 3-lane Source→Bank→Book flow from the design prototype is collapsed to 2-lane in v1.
- TopBar Bank + Subsplash sync buttons. Visually present, no-op.

## When pivoting to production

The big swap-day work, in order:
1. Move DB to Postgres (one-line `provider` change in `schema.prisma`, regenerate migrations)
2. Add NextAuth + Google sign-in
3. Wire actual `POST /api/aplos/post` using `aplos-auth.ts` + `PostingLog` for idempotency
4. Decide on Subsplash strategy (CSV manual / Playwright scraper / paid API)
5. Move CSV ingest off filesystem — either upload-everywhere or import-from-blob-storage
6. Deploy to Vercel (or similar) — the dev server, sync APIs, and DB adapter all work as-is on a server

## Pointers to other context

- `steward/CLAUDE.md` + `steward/AGENTS.md` — Next.js 16 breaking-changes warning. Read before writing new Next code.
- `steward/prisma/schema.prisma` — canonical data model
- The design prototype lived in conversation history (an HTML+JSX file called "After The One Treasury v2.html"). The tokens in `globals.css` came from there.
