/**
 * Creates every Supabase table + the recordings bucket (supabase/setup.sql).
 * Safe to re-run: existing tables and rows are left as they are.
 *
 *   npm run db:setup            # tables only
 *   npm run db:setup -- --demo  # also load the brief's demo assessments + candidates
 *
 * Needs SUPABASE_DB_URL in .env.local: Supabase → Project → Connect →
 * "Session pooler" connection string (with your database password filled in).
 * The REST secret key can't create tables; only a database connection can.
 */
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { SEED_ASSESSMENTS, SEED_CANDIDATES } from "../src/infrastructure/data/demoData";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* fall through to the check below */
  }
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    console.error("SUPABASE_DB_URL is missing in .env.local. Copy the Session pooler connection string from Supabase → Connect.");
    process.exit(1);
  }

  const sql = await connect(url);
  try {
    const setup = await readFile("supabase/setup.sql", "utf8");
    await sql.unsafe(setup); // multi-statement, idempotent (create … if not exists / on conflict do nothing)

    // Demo data is opt-in: `npm run db:setup -- --demo` loads the brief's three
    // assessments and four candidates. Existing rows are left untouched.
    if (process.argv.includes("--demo")) {
      for (const a of SEED_ASSESSMENTS) {
        await sql`insert into public.assessments (assessment_id, title, data, created_at, updated_at)
                  values (${a.assessment_id}, ${a.title}, ${sql.json(a as never)}, ${a.created_at}, ${a.updated_at})
                  on conflict (assessment_id) do nothing`;
      }
      for (const c of SEED_CANDIDATES) {
        await sql`insert into public.candidates (candidate_id, name, data) values (${c.candidate_id}, ${c.name}, ${sql.json(c as never)})
                  on conflict (candidate_id) do nothing`;
      }
    }

    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('assessments', 'candidates', 'interviews', 'proctoring_events')
      order by table_name`;
    const bucket = await sql<{ id: string; public: boolean }[]>`select id, public from storage.buckets where id = 'interview-recordings'`;
    const [{ n: assessments }] = await sql<{ n: number }[]>`select count(*)::int as n from public.assessments`;
    const [{ n: cands }] = await sql<{ n: number }[]>`select count(*)::int as n from public.candidates`;

    console.log(`✔ tables: ${tables.map((t) => t.table_name).join(", ") || "none"}`);
    console.log(`✔ recordings bucket: ${bucket.length ? `ready (public=${bucket[0].public})` : "missing"}`);
    console.log(`✔ in the database now: ${assessments} assessments, ${cands} candidates${process.argv.includes("--demo") ? " (demo data loaded)" : ""}`);
    if (tables.length !== 4 || !bucket.length) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "sa-east-1",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2", "eu-north-1",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2", "me-central-1",
];

const open = (u: string) => postgres(u, { ssl: "require", max: 1, connect_timeout: 10, onnotice: () => undefined });

/**
 * Supabase's "Direct connection" host (db.<ref>.supabase.co) is IPv6-only and
 * fails on many networks. If it does, try the IPv4 Session pooler for each
 * region with the same password (user becomes postgres.<ref>).
 */
async function connect(url: string) {
  const direct = open(url);
  try {
    await direct`select 1`;
    return direct;
  } catch (err) {
    await direct.end().catch(() => undefined);
    const u = new URL(url);
    const ref = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
    if (!ref) throw err;
    console.log("Direct host unreachable (IPv6-only); looking for your project's IPv4 pooler…");
    for (const prefix of ["aws-0", "aws-1"]) {
      for (const region of REGIONS) {
        const pooled = new URL(url);
        pooled.hostname = `${prefix}-${region}.pooler.supabase.com`;
        pooled.port = "5432";
        pooled.username = `postgres.${ref}`;
        const sql = open(pooled.toString());
        try {
          await sql`select 1`;
          console.log(`Connected via ${pooled.hostname} (session pooler).`);
          console.log(`Tip: SUPABASE_DB_URL can use host ${pooled.hostname}, port 5432, user postgres.${ref}.`);
          return sql;
        } catch {
          await sql.end().catch(() => undefined);
        }
      }
    }
    throw new Error("Couldn't reach the database directly or through any session pooler region. Copy the Session pooler string from Supabase → Connect.");
  }
}

main().catch((err) => {
  // Never print the connection string (it contains the password).
  console.error("Setup failed:", err instanceof Error ? err.message.replace(/postgres(ql)?:\/\/[^\s]+/g, "postgres://***") : err);
  process.exit(1);
});
