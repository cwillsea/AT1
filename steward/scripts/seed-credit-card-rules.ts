// Seed credit-card rules into CategorizationRule. Mirrors the previously
// hardcoded tables in src/lib/credit-card-mappings.ts.
//
// Three sources:
//   "credit-card-expense"  — regex on Expense Type → accountNumber
//   "credit-card-ministry" — substring on Ministry text → fundId + tagId
//   "credit-card-merchant" — regex on Merchant Name  → label (display name only)
//
// Idempotent: if rules already exist for a source, that source is skipped.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "dev.db" });
const prisma = new PrismaClient({ adapter });

const FUND_GENERAL = 521243;
const FUND_MISSIONS = 523621;
const FUND_ACADEMY = 525461;

const TAG = {
  GENERAL: 339561,
  YOUTH: 338178,
  KIDS: 338179,
  MENS: 338182,
  YOUNG_ADULTS: 339541,
  WOMENS: 339542,
  HOLY_GROUNDS: 339545,
  WOMENS_CONFERENCE: 339557,
  MISSIONS: 339560,
  ACADEMY: 339618,
  WORSHIP_PROD: 339733,
  NEXTGEN: 340713,
  FINE_ARTS: 341885,
  MOTHERS_DAY: 351539,
  FATHERS_DAY: 351540,
  HOME_OF_HOPE: 351008,
};

// ── Expense-type rules (regex → accountNumber) ───────────────────────────────

const EXPENSE = [
  ["fellowship meal", 5345, "Fellowship Meal → Meals & Entertainment"],
  ["food.*coffee.*kitchen", 5810, "Food / Coffee / Kitchen → 5810"],
  ["facility repairs", 5220, "Facility Repairs → 5220"],
  ["janitorial", 5230, "Janitorial → 5230"],
  ["translat", 5321, "Translation → 5321"],
  ["software.*subscription", 5320, "Software & Subscriptions → 5320"],
  ["office supplies", 5310, "Office Supplies → 5310"],
  ["phones.*internet", 5315, "Phones & Internet → 5315"],
  ["marketing.*advertising", 5380, "Marketing & Advertising → 5380"],
  ["seminars.*training", 5390, "Seminars & Training → 5390"],
  ["vehicle fuel", 5410, "Vehicle Fuel → 5410"],
  ["vehicle maintenance", 5420, "Vehicle Maintenance → 5420"],
  ["special events", 5710, "Special Events → 5710"],
  ["easter", 5730, "Easter → 5730"],
  ["ministry specific supplies", 5510, "Ministry Specific Supplies → 5510"],
  ["ministry events expense", 5520, "Ministry Events Expense → 5520"],
  ["general church supplies", 5540, "General Church Supplies → 5540"],
  ["merchandise", 5820, "Merchandise → 5820"],
  ["benevolence", 5650, "Benevolence → 5650"],
  ["as needed professional services", 5331, "Pro Services (as-needed) → 5331"],
  ["professional services", 5331, "Pro Services → 5331"],
  ["media.*design", 5332, "Media & Design → 5332"],
  ["security", 5250, "Security → 5250"],
  ["photo ?booth", 5710, "Photo booth → Special Events"],
  ["backdrop wall", 5710, "Backdrop wall → Special Events"],
  ["mothers day", 5710, "Mothers Day → Special Events"],
  ["fathers day", 5710, "Fathers Day → Special Events"],
  ["miscellaneous", 5900, "Miscellaneous → 5900"],
] as const;

// ── Ministry rules (substring → fundId + tagId) ──────────────────────────────

const MINISTRY = [
  ["academy",           FUND_ACADEMY,  TAG.ACADEMY,           "Academy"],
  ["missions",          FUND_MISSIONS, TAG.MISSIONS,          "Missions"],
  ["home of hope",      FUND_GENERAL,  TAG.HOME_OF_HOPE,      "Home of Hope"],
  ["mothers day",       FUND_GENERAL,  TAG.MOTHERS_DAY,       "Mothers Day"],
  ["fathers day",       FUND_GENERAL,  TAG.FATHERS_DAY,       "Fathers Day"],
  ["youth",             FUND_GENERAL,  TAG.YOUTH,             "Youth"],
  ["kids",              FUND_GENERAL,  TAG.KIDS,              "Kids"],
  ["nextgen",           FUND_GENERAL,  TAG.NEXTGEN,           "NextGen"],
  ["holy grounds",      FUND_GENERAL,  TAG.HOLY_GROUNDS,      "Holy Grounds"],
  ["fine arts",         FUND_GENERAL,  TAG.FINE_ARTS,         "Fine Arts"],
  ["worship",           FUND_GENERAL,  TAG.WORSHIP_PROD,      "Worship & Production"],
  ["womens conference", FUND_GENERAL,  TAG.WOMENS_CONFERENCE, "Women's Conference"],
  ["womens",            FUND_GENERAL,  TAG.WOMENS,            "Womens"],
  ["women",             FUND_GENERAL,  TAG.WOMENS,            "Womens (alias)"],
  ["mens",              FUND_GENERAL,  TAG.MENS,              "Mens"],
  ["young adults",      FUND_GENERAL,  TAG.YOUNG_ADULTS,      "Young Adults"],
  ["easter",            FUND_GENERAL,  TAG.GENERAL,           "Easter → General tag"],
  ["general",           FUND_GENERAL,  TAG.GENERAL,           "General"],
] as const;

// ── Merchant aliases (regex → display name) ──────────────────────────────────

const MERCHANT = [
  ["amazon|amzn",                              "Amazon"],
  ["wal-?mart|walmart|wm\\s*supercenter",      "Walmart"],
  ["sam'?s\\s*club|samsclub",                  "Sam's Club"],
  ["love'?s",                                  "Love's"],
  ["home\\s*depot|homedepot",                  "Home Depot"],
  ["ace\\s*hdwe|ace\\s*hardware",              "Ace Hardware"],
  ["dollar\\s*general",                        "Dollar General"],
  ["family\\s*dollar",                         "Family Dollar"],
  ["target",                                   "Target"],
  ["marshalls",                                "Marshalls"],
  ["goodwill",                                 "Goodwill"],
  ["salvation\\s*army",                        "Salvation Army"],
  ["harbor\\s*freight",                        "Harbor Freight"],
  ["office\\s*max|officemax|office\\s*depot",  "Office Depot/OfficeMax"],
  ["hobby\\s*lobby",                           "Hobby Lobby"],
  ["chefstore",                                "Chef'Store"],
  ["facebk|facebook",                          "Facebook Ads"],
  ["livevoice",                                "LiveVoice"],
  ["subsplash",                                "Subsplash"],
  ["restream",                                 "Restream"],
  ["ringcentral",                              "RingCentral"],
  ["intuit|quickbooks|qbooks",                 "Intuit QuickBooks"],
  ["canva",                                    "Canva"],
  ["adobe",                                    "Adobe"],
  ["apple\\.com|apple bill",                   "Apple"],
  ["zoom\\.com|zoom\\.us|zoom\\b",             "Zoom"],
  ["gamma\\.app",                              "Gamma"],
  ["opus\\s*clip",                             "Opus Clip"],
  ["smugmug",                                  "SmugMug"],
  ["checkr",                                   "Checkr"],
  ["hope\\s*translator",                       "Hope Translator"],
  ["high\\s*voltage\\s*kids",                  "High Voltage Kids Ministry"],
  ["domino'?s",                                "Domino's"],
  ["chipotle",                                 "Chipotle"],
  ["bahama\\s*bucks",                          "Bahama Bucks"],
  ["barros\\s*pizza",                          "Barros Pizza"],
  ["red\\s*robin",                             "Red Robin"],
  ["eegees",                                   "Eegee's"],
  ["little\\s*caesars",                        "Little Caesars"],
  ["ta\\s*#?\\s*\\d+|ta\\b.*fastfood",         "TA Travel Center"],
  ["autozone",                                 "AutoZone"],
  ["usps",                                     "USPS"],
  ["christianbook|chr\\*christianbook",        "Christianbook"],
  ["nellis\\s*auction",                        "Nellis Auction"],
  ["panaderia\\s*tortilleria",                 "Panaderia Tortilleria"],
  ["arizona\\s*ministry\\s*netwo",             "Arizona Ministry Network"],
  ["arizona\\s*city\\s*pest",                  "Arizona City Pest Control"],
  ["print\\s*&?\\s*sign\\s*express",           "Print & Sign Express"],
  ["linde\\s*gas",                             "Linde Gas & Equipment"],
  ["canteen\\s*vending",                       "Canteen Vending"],
  ["sp\\s*promised\\s*grounds",                "Promised Grounds"],
  ["abiding\\s*impre",                         "Abiding Impressions"],
  ["rsg\\s*impact",                            "RSG Impact"],
  ["ls\\s*goodruby",                           "Goodruby Christian"],
] as const;

async function seedSource(source: string, count: number, fn: () => Promise<void>) {
  const existing = await prisma.categorizationRule.count({ where: { source } });
  if (existing > 0) {
    console.log(`  ${source}: ${existing} rules already exist — skipping`);
    return;
  }
  await fn();
  console.log(`  ${source}: seeded ${count} rules`);
}

async function main() {
  console.log("Seeding credit-card rules…");

  await seedSource("credit-card-expense", EXPENSE.length, async () => {
    let priority = EXPENSE.length;
    for (const [pattern, accountNumber, label] of EXPENSE) {
      await prisma.categorizationRule.create({
        data: {
          source: "credit-card-expense",
          matchType: "regex",
          pattern,
          priority: priority--,
          accountNumber,
          label,
        },
      });
    }
  });

  await seedSource("credit-card-ministry", MINISTRY.length, async () => {
    let priority = MINISTRY.length;
    for (const [pattern, fundId, tagId, label] of MINISTRY) {
      await prisma.categorizationRule.create({
        data: {
          source: "credit-card-ministry",
          matchType: "contains",
          pattern,
          priority: priority--,
          fundId,
          tagId,
          label,
        },
      });
    }
  });

  await seedSource("credit-card-merchant", MERCHANT.length, async () => {
    let priority = MERCHANT.length;
    for (const [pattern, label] of MERCHANT) {
      await prisma.categorizationRule.create({
        data: {
          source: "credit-card-merchant",
          matchType: "regex",
          pattern,
          priority: priority--,
          label,
        },
      });
    }
  });

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
