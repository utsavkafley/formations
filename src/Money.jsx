import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import store, { hasRemote } from "./store.js";
import Crest from "./Crest.jsx";
import {
  isAdmin,
  hasPasscode,
  setPasscode,
  checkPasscode,
  startAdminSession,
  endAdminSession,
} from "./admin.js";

// What the group has put in. The page lists the people who HAVE contributed —
// not the whole squad with dashes against most of it. Who is missing is the
// organizer's problem to chase, and they can see it on the board below; for
// everyone else a list of thirty-six names with four amounts in it reads as a
// wall of people who haven't paid.

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const moneyExact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Cents in, string out. Whole dollars lose the ".00" because every figure the
// group quotes is round; anything with cents in it prints them.
export function dollars(cents) {
  if (cents == null) return null;
  return cents % 100 === 0 ? money.format(cents / 100) : moneyExact.format(cents / 100);
}

// "100", "$100", "1,200.50" — all of it is somebody typing an amount in a
// hurry. Null when there is no number in there at all.
export function parseAmount(text) {
  const n = Number(String(text).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export default function Money({ onNavigate }) {
  const [admin, setAdmin] = useState(() => isAdmin());
  const [members, setMembers] = useState([]);
  const [collections, setCollections] = useState([]);
  const [pickedId, setPickedId] = useState(null);
  const [paid, setPaid] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState(false);

  const load = useCallback(async () => {
    const [ms, cs] = await Promise.all([store.fetchMembers(), store.fetchCollections()]);
    setMembers(ms.filter((m) => m.active !== false));
    setCollections(cs);
    return cs;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cs = await load();
        if (!alive) return;
        setPickedId((id) => id || cs.find((c) => !c.closed)?.id || cs[0]?.id || null);
        setError(null);
      } catch (e) {
        if (alive) setError(e.message || "Couldn't load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  // Admin state lives in localStorage, so a sign-in in another tab should show
  // up here too rather than needing a reload.
  useEffect(() => {
    const sync = () => setAdmin(isAdmin());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const picked = collections.find((c) => c.id === pickedId) || null;

  const reloadPaid = useCallback(async (id) => {
    if (!id) return setPaid([]);
    setPaid(await store.fetchContributions(id));
  }, []);

  useEffect(() => {
    reloadPaid(pickedId).catch(() => setPaid([]));
  }, [pickedId, reloadPaid]);

  const byMember = useMemo(() => {
    const m = new Map();
    for (const p of paid) m.set(p.memberId, (m.get(p.memberId) || 0) + p.amountCents);
    return m;
  }, [paid]);

  const nameOf = useMemo(() => {
    const m = new Map(members.map((x) => [x.id, x.name]));
    // Somebody removed from the squad can still have paid into an old round,
    // and dropping their name would make the total not add up.
    return (id) => m.get(id) || "Former member";
  }, [members]);

  const raised = useMemo(() => paid.reduce((n, p) => n + p.amountCents, 0), [paid]);
  const share = picked?.perPersonCents || null;
  const settled = share ? [...byMember.values()].filter((c) => c >= share).length : byMember.size;
  const pct = picked?.targetCents ? Math.min(100, (raised / picked.targetCents) * 100) : null;

  async function guard(fn) {
    setBusy(true);
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(e.message || "That didn't save");
    } finally {
      setBusy(false);
    }
  }

  const give = (memberId, amountCents) =>
    guard(async () => {
      await store.addContribution({ collectionId: picked.id, memberId, amountCents });
      await reloadPaid(picked.id);
    });

  const ungive = (memberId) =>
    guard(async () => {
      for (const p of paid.filter((x) => x.memberId === memberId)) {
        await store.removeContribution(p.id);
      }
      await reloadPaid(picked.id);
    });

  return (
    <div className="poll">
      <div className="poll-shell">
        <header className="money-head">
          <button className="back-link" onClick={() => onNavigate("/")}>
            ← Poll
          </button>
          <div className="money-title">
            <Crest size={30} />
            <h1 className="page-title sm">Contributions</h1>
          </div>
          {admin ? (
            <button
              className="admin-flag"
              onClick={() => {
                endAdminSession();
                setAdmin(false);
              }}
              title="Sign out"
            >
              Organizer
            </button>
          ) : (
            <button className="admin-link" onClick={() => setGate(true)}>
              Admin
            </button>
          )}
        </header>

        {gate && (
          <AdminGate
            onClose={() => setGate(false)}
            onIn={() => {
              startAdminSession();
              setAdmin(true);
              setGate(false);
            }}
          />
        )}

        {error && (
          <div className="conn-banner" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="roster-block">
            <div className="roster-empty">Loading…</div>
          </div>
        ) : !picked ? (
          <section className="roster-block">
            <h3>Nothing yet</h3>
            <div className="roster-empty">
              {admin
                ? "Admin — organize a contribution below: what it's for, the total, and the share per head."
                : "Nothing is being collected right now. An organizer will put one up."}
            </div>
          </section>
        ) : (
          <>
            <section className="drive">
              <div className="drive-top">
                <div>
                  <div className="drive-kicker">{picked.closed ? "Closed" : "Collecting"}</div>
                  <h2 className="drive-title">{picked.title}</h2>
                </div>
                {share && <div className="drive-share">{dollars(share)} each</div>}
              </div>

              <div className="drive-figures">
                <span className="drive-raised">{dollars(raised)}</span>
                {picked.targetCents != null && (
                  <span className="drive-target">of {dollars(picked.targetCents)}</span>
                )}
              </div>

              {pct != null && (
                <div
                  className="drive-meter"
                  role="img"
                  aria-label={`${dollars(raised)} of ${dollars(picked.targetCents)} raised`}
                >
                  <span style={{ width: `${pct}%` }} />
                </div>
              )}

              <div className="drive-note">
                {settled} of {members.length} have put in
                {picked.note ? ` · ${picked.note}` : ""}
              </div>
            </section>

            {collections.length > 1 && (
              <div className="drive-switch">
                {collections.map((c) => (
                  <button
                    key={c.id}
                    className={`drive-tab ${c.id === pickedId ? "on" : ""}`}
                    onClick={() => setPickedId(c.id)}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}

            <Contributed byMember={byMember} nameOf={nameOf} share={share} />

            {admin && (
              <GiveBoard
                members={members}
                byMember={byMember}
                share={share}
                busy={busy}
                nameOf={nameOf}
                onSetShare={(cents) =>
                  guard(async () => {
                    await store.updateCollection(picked.id, { perPersonCents: cents });
                    setCollections(await store.fetchCollections());
                  })
                }
                onGive={give}
                onUngive={ungive}
              />
            )}
          </>
        )}

        {admin && (
          <AdminTools
            picked={picked}
            busy={busy}
            onNavigate={onNavigate}
            onNewCollection={(fields) =>
              guard(async () => {
                const c = await store.addCollection(fields);
                const cs = await load();
                setCollections(cs);
                setPickedId(c.id);
              })
            }
            onToggleClosed={() =>
              guard(async () => {
                await store.updateCollection(picked.id, { closed: !picked.closed });
                setCollections(await store.fetchCollections());
              })
            }
          />
        )}

        {!hasRemote && (
          <div className="local-note">
            Local-only mode — add Supabase keys to share across devices.
          </div>
        )}
      </div>
    </div>
  );
}

// The people who have put in, and nobody else.
function Contributed({ byMember, nameOf, share }) {
  const rows = [...byMember.entries()].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])));

  return (
    <section className="roster-block in">
      <h3>Contributed</h3>
      {rows.length === 0 ? (
        <div className="roster-empty">Nobody yet.</div>
      ) : (
        <div className="ledger">
          {rows.map(([id, amount]) => (
            <div key={id} className={`ledger-row ${!share || amount >= share ? "done" : "part"}`}>
              <span className="ledger-name">{nameOf(id)}</span>
              <span className="ledger-amount">
                {dollars(amount)}
                {share && amount < share && <em> of {dollars(share)}</em>}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Marking somebody down as having paid: set the share once, then drag their
// name into the box — or just tap it, which does the same thing. Both, because
// this is used standing by a pitch on a phone: dragging is the gesture the
// instruction describes, and tapping is the one that works when you are
// holding a ball under one arm. HTML5 drag-and-drop is not used anywhere here;
// it does not fire on touch at all.
function GiveBoard({ members, byMember, share, busy, nameOf, onSetShare, onGive, onUngive }) {
  const [draft, setDraft] = useState(share ? String(share / 100) : "");
  const [ghost, setGhost] = useState(null); // { name, x, y }
  const [over, setOver] = useState(false);
  const press = useRef(null);

  useEffect(() => {
    setDraft(share ? String(share / 100) : "");
  }, [share]);

  const paidIds = new Set(byMember.keys());
  const waiting = members.filter((m) => !paidIds.has(m.id));
  const inBox = [...byMember.keys()];

  function commitShare() {
    const cents = parseAmount(draft);
    if (cents && cents !== share) onSetShare(cents);
    else if (!cents) setDraft(share ? String(share / 100) : "");
  }

  // One press handles both gestures: a release that never travelled is a tap,
  // a release over the box after travelling is a drop. Anything else is a
  // scroll the person started on top of a chip, and is left alone.
  function onPointerDown(e, m) {
    if (!share || busy) return;
    if (e.button != null && e.button > 0) return;
    press.current = { id: m.id, name: m.name, x: e.clientX, y: e.clientY, dragging: false };
  }

  useEffect(() => {
    function move(e) {
      const p = press.current;
      if (!p) return;
      if (!p.dragging) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
        p.dragging = true;
      }
      e.preventDefault();
      setGhost({ name: p.name, x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setOver(Boolean(el && el.closest(".dropbox")));
    }
    function up(e) {
      const p = press.current;
      press.current = null;
      setGhost(null);
      setOver(false);
      if (!p) return;
      if (!p.dragging) return onGive(p.id, share); // a tap
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el.closest(".dropbox")) onGive(p.id, share);
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [onGive, share]);

  return (
    <section className="roster-block admin-block">
      <h3>Mark who has paid</h3>

      <label className="give-label" htmlFor="per-head">
        Amount per person
      </label>
      <input
        id="per-head"
        className="give-amount"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitShare}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder="e.g. 100"
        inputMode="decimal"
      />

      <label className="give-label">Contributed</label>
      <div className={`dropbox ${over ? "over" : ""} ${!share ? "locked" : ""}`}>
        {!share ? (
          <span className="dropbox-hint">Set an amount per person first</span>
        ) : inBox.length === 0 ? (
          <span className="dropbox-hint">Drag a name here, or tap one below</span>
        ) : (
          inBox.map((id) => (
            <span key={id} className="namechip in-box">
              {nameOf(id)}
              <button
                onClick={() => onUngive(id)}
                aria-label={`Remove ${nameOf(id)}`}
                disabled={busy}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <label className="give-label">Still to pay</label>
      <div className="namechips">
        {waiting.length === 0 ? (
          <span className="roster-empty">Everyone has paid.</span>
        ) : (
          waiting.map((m) => (
            <button
              key={m.id}
              className={`namechip draggable ${!share ? "muted" : ""}`}
              onPointerDown={(e) => onPointerDown(e, m)}
              disabled={!share || busy}
            >
              {m.name}
            </button>
          ))
        )}
      </div>

      {ghost && (
        <span className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
          {ghost.name}
        </span>
      )}
    </section>
  );
}

function AdminTools({ picked, busy, onNavigate, onNewCollection, onToggleClosed }) {
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [per, setPer] = useState("");
  const [pass, setPass] = useState("");
  const [passState, setPassState] = useState(null); // null | "saving" | "saved" | error text

  return (
    <section className="roster-block admin-block">
      <h3>Organizer</h3>

      <div className="admin-sub">New collection</div>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onNewCollection({
            title: title.trim(),
            targetCents: parseAmount(target),
            perPersonCents: parseAmount(per),
          });
          setTitle("");
          setTarget("");
          setPer("");
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What it's for" aria-label="Title" />
        <div className="admin-row">
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Total, e.g. 2200" inputMode="decimal" aria-label="Target" />
          <input value={per} onChange={(e) => setPer(e.target.value)} placeholder="Each, e.g. 100" inputMode="decimal" aria-label="Per person" />
        </div>
        <button type="submit" disabled={!title.trim() || busy}>
          Start it
        </button>
      </form>

      {picked && (
        <button className="admin-ghost" onClick={onToggleClosed} disabled={busy}>
          {picked.closed ? "Reopen this collection" : "Close this collection"}
        </button>
      )}

      {/* The squad lives on its own page. Names have nothing to do with money,
          and every row of this one that is not about money is a row an
          organizer has to read past to get to the thing they came for. */}
      <button className="admin-ghost" onClick={() => onNavigate("/squad")}>
        Edit squad names →
      </button>

      <div className="admin-sub">Passcode</div>
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pass.length < 6) return setPassState("Use at least six characters");
          setPassState("saving");
          try {
            await setPasscode(pass);
            setPass("");
            setPassState("saved");
          } catch (err) {
            setPassState(err.message || "Couldn't save that");
          }
        }}
      >
        <div className="admin-row">
          <input
            type="password"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              setPassState(null);
            }}
            placeholder="New passcode"
            aria-label="New passcode"
            autoComplete="new-password"
          />
          <button type="submit" disabled={!pass || busy || passState === "saving"}>
            {passState === "saving" ? "…" : "Change"}
          </button>
        </div>
        {passState && passState !== "saving" && (
          <div className={passState === "saved" ? "pass-ok" : "gate-err"}>
            {passState === "saved" ? "Changed. Everyone else will need the new one." : passState}
          </div>
        )}
      </form>
    </section>
  );
}

// The passcode dialog. One job: take a passcode and check it.
//
// It used to offer to SET the passcode when none was found, which made the
// lock first-come-first-served — whoever opened this before the organizers did
// became the organizer. The passcode is seeded straight into Supabase now
// (scripts/passcode.mjs prints the statement), so a missing one is a setup
// step that has not been run, and saying so is better than handing the keys to
// whoever happened to tap the dot.
function AdminGate({ onClose, onIn }) {
  const [ready, setReady] = useState(null); // null = checking, false = none set
  const [code, setCode] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    hasPasscode()
      .then((has) => alive && setReady(has))
      .catch(() => alive && setReady(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (await checkPasscode(code)) onIn();
      else setErr("That's not it");
    } catch (e2) {
      setErr(e2.message || "Couldn't check that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div
        className="sheet gate"
        role="dialog"
        aria-modal="true"
        aria-label="Organizer sign in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="sheet-title">Organizer</h2>
        <div className="sheet-sub">
          {ready === false
            ? "No passcode has been set on this database yet. Run scripts/passcode.mjs and paste what it prints into Supabase."
            : "For whoever keeps the squad and the money straight."}
        </div>
        {ready !== false && (
          <form className="gate-form" onSubmit={submit}>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Passcode"
              aria-label="Passcode"
              autoFocus
              autoComplete="current-password"
            />
            {err && <div className="gate-err">{err}</div>}
            <button className="sheet-done" type="submit" disabled={busy || ready === null || !code}>
              Sign in
            </button>
          </form>
        )}
        <button className="sheet-skip" onClick={onClose}>
          Not now
        </button>
      </div>
    </div>
  );
}
