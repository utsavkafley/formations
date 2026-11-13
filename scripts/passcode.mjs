// Print the SQL that seeds the organizer passcode.
//
//   node scripts/passcode.mjs "the passcode you want"
//
// The passcode itself never goes near this repository — the repository is
// public, so a passcode committed to it is a passcode everybody has. What this
// prints is the salted PBKDF2 hash, which is no secret: it already sits in
// `app_settings`, a table the app reads with the anon key. Paste the statement
// into the Supabase SQL editor and the lock is set.
//
// The parameters below must stay in step with src/admin.js. If you change one,
// change both, or every existing passcode stops matching.
import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITERATIONS = 210_000;
const code = process.argv[2];

if (!code || code.length < 6) {
  console.error("Usage: node scripts/passcode.mjs <passcode>   (at least 6 characters)");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(code, salt, ITERATIONS, 32, "sha256").toString("hex");
const value = JSON.stringify({ salt: salt.toString("hex"), hash, iterations: ITERATIONS });

console.log(`
-- Organizer passcode. Re-running this replaces whatever is set.
insert into public.app_settings (key, value)
values ('admin_passcode', '${value}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
`);
