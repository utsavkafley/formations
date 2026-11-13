import { useCallback, useEffect, useState } from "react";
import store, { hasRemote } from "./store.js";
import { isAdmin } from "./admin.js";

// The squad: who is in it and what they are called. Split off the money page,
// where it was three rows an organizer had to scroll past to reach the thing
// they came for. Everyone can read the list; only an organizer can change it,
// and the sign-in for that lives on /money.
export default function Squad({ onNavigate }) {
  const [admin] = useState(() => isAdmin());
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    const ms = await store.fetchMembers();
    setMembers(ms);
  }, []);

  useEffect(() => {
    let alive = true;
    load()
      .catch((e) => alive && setError(e.message || "Couldn't load"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

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

  const active = members.filter((m) => m.active !== false);

  return (
    <div className="poll">
      <div className="poll-shell">
        <header className="money-head">
          <button className="back-link" onClick={() => onNavigate("/money")}>
            ← Contributions
          </button>
          <div className="money-title">
            <h1 className="page-title sm">Squad</h1>
          </div>
          {admin && <span className="admin-flag as-text">Organizer</span>}
        </header>

        {error && (
          <div className="conn-banner" role="alert">
            {error}
          </div>
        )}

        <section className="roster-block">
          <h3>
            {active.length} {active.length === 1 ? "player" : "players"}
          </h3>

          {admin && (
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                guard(async () => {
                  await store.addMember(newName.trim());
                  await load();
                });
                setNewName("");
              }}
            >
              <div className="admin-row">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Add a player"
                  aria-label="New player name"
                />
                <button type="submit" disabled={!newName.trim() || busy}>
                  Add
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="roster-empty">Loading…</div>
          ) : (
            <div className="namechips">
              {active.map((m) =>
                admin && editId === m.id ? (
                  <form
                    key={m.id}
                    className="rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = editName.trim();
                      if (name && name !== m.name) {
                        guard(async () => {
                          await store.updateMember(m.id, { name });
                          await load();
                        });
                      }
                      setEditId(null);
                    }}
                  >
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label={`Rename ${m.name}`}
                      autoFocus
                      onBlur={() => setEditId(null)}
                    />
                    <button type="submit" disabled={busy}>
                      Save
                    </button>
                  </form>
                ) : admin ? (
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
                ) : (
                  <span key={m.id} className="namechip">
                    {m.name}
                  </span>
                ),
              )}
            </div>
          )}

          {!admin && !loading && (
            <div className="roster-empty squad-foot">
              An organizer can add players and fix names — sign in from
              Contributions.
            </div>
          )}
        </section>

        {!hasRemote && (
          <div className="local-note">
            Local-only mode — add Supabase keys to share across devices.
          </div>
        )}
      </div>
    </div>
  );
}
