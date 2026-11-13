import { useCallback, useEffect, useMemo, useState } from "react";
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

// What the group has put in. Everyone can read this page; only a browser
// holding the organizer passcode can change anything on it, and the controls
// simply are not rendered otherwise — a disabled button that everyone can see
// invites people to ask why it is disabled.

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

  const raised = useMemo(() => paid.reduce((n, p) => n + p.amountCents, 0), [paid]);
  const share = picked?.perPersonCents || null;
  const settled = share ? members.filter((m) => (byMember.get(m.id) || 0) >= share).length : null;
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
            /* The way in. Deliberately almost nothing: the people who need it
               know it is here, and nobody else is invited to wonder. */
            <button className="admin-dot" onClick={() => setGate(true)} aria-label="Organizer sign in">
              ·
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
              No collection has been started. {admin ? "Start one below." : "An organizer will add one."}
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
                {settled != null
                  ? `${settled} of ${members.length} have put in their share`
                  : `${byMember.size} ${byMember.size === 1 ? "person has" : "people have"} put in`}
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

            <Ledger
              members={members}
              byMember={byMember}
              share={share}
              paid={paid}
              admin={admin}
              busy={busy}
              onAdd={(memberId, amountCents, note) =>
                guard(async () => {
                  await store.addContribution({
                    collectionId: picked.id,
                    memberId,
                    amountCents,
                    note,
                  });
                  await reloadPaid(picked.id);
                })
              }
              onRemove={(id) =>
                guard(async () => {
                  await store.removeContribution(id);
                  await reloadPaid(picked.id);
                })
              }
            />
          </>
        )}

        {admin && (
          <AdminTools
            picked={picked}
            members={members}
            busy={busy}
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
            onAddMember={(name) =>
              guard(async () => {
                await store.addMember(name);
                await load();
              })
            }
            onRenameMember={(id, name) =>
              guard(async () => {
                await store.updateMember(id, { name });
                await load();
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

// Every member, every time, in the order people scan for their own name. The
// ones who have not put in are the point of the page, so they are not hidden
// behind a filter — they are just the rows with nothing in the amount column.
function Ledger({ members, byMember, share, paid, admin, busy, onAdd, onRemove }) {
  const [openId, setOpenId] = useState(null);

  return (
    <section className="roster-block">
      <h3>Who has put in</h3>
      <div className="ledger">
        {members.map((m) => {
          const amount = byMember.get(m.id) || 0;
          const done = share ? amount >= share : amount > 0;
          return (
            <div key={m.id}>
              <div
                className={`ledger-row ${done ? "done" : ""} ${admin ? "editable" : ""}`}
                onClick={admin ? () => setOpenId(openId === m.id ? null : m.id) : undefined}
                role={admin ? "button" : undefined}
                tabIndex={admin ? 0 : undefined}
                onKeyDown={
                  admin
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenId(openId === m.id ? null : m.id);
                        }
                      }
                    : undefined
                }
              >
                <span className="ledger-name">{m.name}</span>
                <span className="ledger-amount">{amount ? dollars(amount) : "—"}</span>
              </div>
              {admin && openId === m.id && (
                <PayForm
                  busy={busy}
                  share={share}
                  entries={paid.filter((p) => p.memberId === m.id)}
                  onAdd={(cents, note) => {
                    onAdd(m.id, cents, note);
                    setOpenId(null);
                  }}
                  onRemove={onRemove}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PayForm({ busy, share, entries, onAdd, onRemove }) {
  const [amount, setAmount] = useState(share ? String(share / 100) : "");
  const [note, setNote] = useState("");
  const cents = parseAmount(amount);

  return (
    <div className="payform">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cents) onAdd(cents, note.trim());
        }}
      >
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          inputMode="decimal"
          aria-label="Amount"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          aria-label="Note"
        />
        <button type="submit" disabled={!cents || busy}>
          Add
        </button>
      </form>
      {entries.length > 0 && (
        <div className="payform-list">
          {entries.map((p) => (
            <span key={p.id} className="payform-chip">
              {dollars(p.amountCents)}
              {p.note ? ` · ${p.note}` : ""} · {p.paidOn}
              <button onClick={() => onRemove(p.id)} aria-label="Remove this payment" disabled={busy}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminTools({ picked, members, busy, onNewCollection, onToggleClosed, onAddMember, onRenameMember }) {
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [per, setPer] = useState("");
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

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

      <div className="admin-sub">Squad</div>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          onAddMember(newName.trim());
          setNewName("");
        }}
      >
        <div className="admin-row">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a squad member" aria-label="New member name" />
          <button type="submit" disabled={!newName.trim() || busy}>
            Add
          </button>
        </div>
      </form>

      <div className="namechips">
        {members.map((m) =>
          editId === m.id ? (
            <form
              key={m.id}
              className="rename"
              onSubmit={(e) => {
                e.preventDefault();
                if (editName.trim()) onRenameMember(m.id, editName.trim());
                setEditId(null);
              }}
            >
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                aria-label={`Rename ${m.name}`}
                autoFocus
              />
              <button type="submit" disabled={busy}>
                Save
              </button>
            </form>
          ) : (
            <button
              key={m.id}
              className="namechip editable"
              onClick={() => {
                setEditId(m.id);
                setEditName(m.name);
              }}
            >
              {m.name} <span className="pencil">✎</span>
            </button>
          ),
        )}
      </div>
    </section>
  );
}

// The passcode dialog. Two modes, and which one you get is not a choice: if no
// passcode has been set on this database yet, the first person here sets it.
// That beats shipping a default everyone knows, and it is the organizer's job
// to do it on the day this goes up.
function AdminGate({ onClose, onIn }) {
  const [fresh, setFresh] = useState(null); // null = still checking
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    hasPasscode()
      .then((has) => alive && setFresh(!has))
      .catch(() => alive && setFresh(false));
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
      if (fresh) {
        if (code.length < 6) throw new Error("Use at least six characters");
        if (code !== again) throw new Error("The two don't match");
        await setPasscode(code);
        onIn();
      } else if (await checkPasscode(code)) {
        onIn();
      } else {
        setErr("That's not it");
      }
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
        <h2 className="sheet-title">{fresh ? "Set the organizer passcode" : "Organizer"}</h2>
        <div className="sheet-sub">
          {fresh
            ? "Nobody has set one yet. Whatever you pick here is what the other organizers will use."
            : "For whoever keeps the squad and the money straight."}
        </div>
        <form className="gate-form" onSubmit={submit}>
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Passcode"
            aria-label="Passcode"
            autoFocus
            autoComplete={fresh ? "new-password" : "current-password"}
          />
          {fresh && (
            <input
              type="password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              placeholder="Again"
              aria-label="Passcode again"
              autoComplete="new-password"
            />
          )}
          {err && <div className="gate-err">{err}</div>}
          <button className="sheet-done" type="submit" disabled={busy || fresh === null || !code}>
            {fresh ? "Set it" : "Sign in"}
          </button>
        </form>
        <button className="sheet-skip" onClick={onClose}>
          Not now
        </button>
      </div>
    </div>
  );
}
