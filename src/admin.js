// The organizer lock.
//
// Read this before trusting it: the passcode gates the SCREEN, not the data.
// The app has no login and talks to Supabase with the anon key, so the tables
// are writable by anyone who opens devtools, whatever this module says. What
// it buys is that the group's thirty-six members see figures they cannot
// change by accident, and that editing is something you opt into rather than
// something anybody wanders into. For a football kitty that is the right size
// of lock. If this data ever matters to someone outside the group, the answer
// is Supabase Auth and policies keyed on `auth.uid()`, not a longer passcode.
//
// The hash is public — it lives in `app_settings`, which anyone can read — so
// it is PBKDF2 rather than a bare SHA-256. A six-character code digested once
// is reversed by a rainbow table in no time; at 210k iterations, guessing it
// costs about a third of a second per attempt in a browser.
import store from "./store.js";

const KEY = "admin_passcode";
const SESSION = "yolo.admin.v1";
const ITERATIONS = 210_000;
// A month: long enough that an organizer is not retyping it every week, short
// enough that a phone lent out or lost stops being an organizer's phone.
const SESSION_DAYS = 30;

const enc = new TextEncoder();
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

async function derive(code, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return hex(bits);
}

// Compared without an early return. The timing of a string compare leaks very
// little here and the attacker already has the hash, but it costs one line.
function sameDigest(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hasPasscode() {
  try {
    return Boolean(await store.fetchSetting(KEY));
  } catch {
    return false;
  }
}

export async function setPasscode(code) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(code, salt, ITERATIONS);
  await store.setSetting(KEY, { salt: hex(salt), hash, iterations: ITERATIONS });
}

// True only when the code matches. A missing record returns false rather than
// letting anyone in — the dialog asks to SET a passcode in that case, which is
// a different path on purpose.
export async function checkPasscode(code) {
  const rec = await store.fetchSetting(KEY);
  if (!rec?.salt || !rec?.hash) return false;
  const hash = await derive(code, unhex(rec.salt), rec.iterations || ITERATIONS);
  return sameDigest(hash, rec.hash);
}

export function isAdmin() {
  try {
    const until = Number(JSON.parse(localStorage.getItem(SESSION))?.until);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function startAdminSession() {
  try {
    const until = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(SESSION, JSON.stringify({ until }));
  } catch {
    /* private window: the session just won't outlive the tab */
  }
}

export function endAdminSession() {
  try {
    localStorage.removeItem(SESSION);
  } catch {
    /* nothing to clear */
  }
}
