import { useCallback, useEffect, useMemo, useState } from "react";
import store, { hasRemote } from "./store.js";
import {
  getNextGame,
  applyMeta,
  prettyDate,
  prettyTime,
  prettyDay,
  isPollOpen,
  daysUntil,
} from "./schedule.js";
import { getDeviceId, getMe, setMe } from "./device.js";
import { CORE_SQUAD } from "./squad.js";

export default function Poll({ onNavigate }) {
  const game = useMemo(() => getNextGame(), []);
  const deviceId = useMemo(() => getDeviceId(), []);
  const [me, setMeState] = useState(() => getMe());
  const [data, setData] = useState({ votes: {}, guests: [], meta: null });
  const [loading, setLoading] = useState(true);
  const [guestName, setGuestName] = useState("");
  const [editingMeta, setEditingMeta] = useState(false);

  const eff = applyMeta(game, data.meta);

  // Authoritative refetch — used both on load and after every mutation, so the
  // UI reflects exactly what's in the store (no optimistic patches that could
  // drift or double-count against the live subscription).
  const reload = useCallback(async () => {
    const d = await store.fetchGame(game.date);
    setData(d);
    setLoading(false);
  }, [game.date]);

  // Load + live-subscribe to this game's poll.
  useEffect(() => {
    reload();
    const unsub = store.subscribe(game.date, reload);
    return () => unsub();
  }, [game.date, reload]);

  const myVote = me ? data.votes[me.id]?.status : null;
  const myGuests = me ? data.guests.filter((g) => g.hostMemberId === me.id) : [];

  const roster = CORE_SQUAD;
  const inList = roster.filter((m) => data.votes[m.id]?.status === "in");
  const outList = roster.filter((m) => data.votes[m.id]?.status === "out");
  const noResp = roster.filter((m) => !data.votes[m.id]);
  const guestsByHost = (id) => data.guests.filter((g) => g.hostMemberId === id);

  function pickMe(id) {
    const member = roster.find((m) => m.id === id);
    setMe(member);
    setMeState(member ? { id: member.id, name: member.name } : null);
  }

  async function vote(status) {
    if (!me) return;
    await store.setVote(game.date, { memberId: me.id, memberName: me.name, status, deviceId });
    // A guest comes with their host — dropping to OUT drops their guests too.
    if (status === "out") {
      const mine = data.guests.filter((g) => g.hostMemberId === me.id);
      await Promise.all(mine.map((g) => store.removeGuest(game.date, g.id)));
    }
    reload();
  }

  async function addGuest(e) {
    e.preventDefault();
    const nm = guestName.trim();
    if (!nm || !me) return;
    setGuestName("");
    await store.addGuest(game.date, {
      name: nm,
      hostMemberId: me.id,
      hostName: me.name,
      deviceId,
    });
    reload();
  }

  async function removeGuest(id) {
    await store.removeGuest(game.date, id);
    reload();
  }

  // Open the poll ahead of its automatic 2-days-prior opening.
  async function openNow() {
    await store.openPoll(game.date, {
      slotId: game.slotId,
      kickoffAt: game.when.toISOString(),
      opensAt: game.opensAt.toISOString(),
    });
    reload();
  }

  const open = isPollOpen(game, data.meta?.openedManually);
  const totalIn = inList.length + data.guests.length;

  return (
    <div className="poll">
      <div className="poll-card">
        <header className="poll-head">
          <div className="poll-kicker">{open ? "Next game · tap to RSVP" : "Next game · RSVP opens soon"}</div>
          <h1 className="poll-date">{prettyDate(game.date)}</h1>
          <div className="poll-when">
            <span>🕕 {prettyTime(eff.time)}</span>
            <span>📍 {eff.location}</span>
            <button className="link-btn" onClick={() => setEditingMeta((v) => !v)}>
              {editingMeta ? "close" : "edit"}
            </button>
          </div>
          {eff.note && <div className="poll-note">ℹ️ {eff.note}</div>}
          {open && (
            <div className="poll-tally">
              <b className="t-in">{totalIn}</b> in
              <span className="dot-sep">·</span>
              <b className="t-out">{outList.length}</b> out
              <span className="dot-sep">·</span>
              <b>{noResp.length}</b> no reply
              {data.guests.length > 0 && (
                <>
                  <span className="dot-sep">·</span>
                  <b>{data.guests.length}</b> guest{data.guests.length === 1 ? "" : "s"}
                </>
              )}
            </div>
          )}
        </header>

        {editingMeta && (
          <MetaEditor
            game={eff}
            onSave={async (m) => {
              await store.setMeta(game.date, m);
              reload();
            }}
            onDone={() => setEditingMeta(false)}
          />
        )}

        {!open && (
          <div className="poll-teaser">
            <div className="teaser-lock">🔒 RSVP opens {prettyDay(game.opensAt)}</div>
            <div className="teaser-sub">
              {daysUntil(game.opensAt) === 0
                ? "Opening today — check back shortly, or open it now."
                : `In ${daysUntil(game.opensAt)} day${daysUntil(game.opensAt) === 1 ? "" : "s"}. Come back then to mark yourself IN or OUT.`}
            </div>
            <button className="open-now-btn" onClick={openNow}>
              Open RSVP now
            </button>
          </div>
        )}

        {open && (
          <>
        {/* Identify (no login) */}
        <div className="poll-me">
          <label>You are</label>
          <select value={me?.id || ""} onChange={(e) => pickMe(e.target.value)}>
            <option value="" disabled>
              Pick your name…
            </option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* IN / OUT */}
        {me ? (
          <>
            <div className="poll-vote">
              <button className={`vote-btn in ${myVote === "in" ? "active" : ""}`} onClick={() => vote("in")}>
                ✅ I'm IN
              </button>
              <button className={`vote-btn out ${myVote === "out" ? "active" : ""}`} onClick={() => vote("out")}>
                ❌ I'm OUT
              </button>
            </div>

            {myVote === "in" && (
              <div className="poll-guest">
                <div className="guest-prompt">Bringing a guest?</div>
                <form className="guest-form" onSubmit={addGuest}>
                  <input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Guest name…"
                    aria-label="Guest name"
                  />
                  <button type="submit">+ Add</button>
                </form>
                {myGuests.length > 0 && (
                  <div className="guest-chips">
                    {myGuests.map((g) => (
                      <span key={g.id} className="guest-chip">
                        {g.name}
                        <button onClick={() => removeGuest(g.id)} aria-label={`Remove ${g.name}`}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="poll-hint">Pick your name above to mark yourself IN or OUT.</p>
        )}

        {loading && <p className="poll-hint">Loading…</p>}

        {/* Roster status */}
        <div className="roster">
          <RosterCol title="IN" cls="in" members={inList} guestsByHost={guestsByHost} looseGuests={data.guests.filter((g) => !inList.some((m) => m.id === g.hostMemberId))} />
          <RosterCol title="OUT" cls="out" members={outList} />
          <RosterCol title="No reply" cls="none" members={noResp} muted />
        </div>
          </>
        )}

        <footer className="poll-foot">
          <button className="build-link" onClick={() => onNavigate("/build")}>
            Organizer → balance teams & build formation
          </button>
          {!hasRemote && (
            <div className="local-warn">
              ⚠️ Running in local-only mode — add Supabase keys to share across devices. See{" "}
              <code>SETUP.md</code>.
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

function RosterCol({ title, cls, members, guestsByHost, looseGuests = [], muted }) {
  return (
    <div className={`roster-col roster-${cls} ${muted ? "muted-col" : ""}`}>
      <div className="roster-title">
        {title} <span className="roster-count">{members.length}</span>
      </div>
      <ul>
        {members.map((m) => (
          <li key={m.id}>
            {m.name}
            {guestsByHost &&
              guestsByHost(m.id).map((g) => (
                <span key={g.id} className="li-guest">
                  +{g.name}
                </span>
              ))}
          </li>
        ))}
        {looseGuests.map((g) => (
          <li key={g.id} className="li-guest-row">
            {g.name} <span className="li-guest">guest of {g.hostName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetaEditor({ game, onSave, onDone }) {
  const [time, setTime] = useState(game.time);
  const [location, setLocation] = useState(game.location);
  const [note, setNote] = useState(game.note || "");
  return (
    <form
      className="meta-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ time, location, note: note.trim() || null });
        onDone();
      }}
    >
      <label>
        Time
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label>
        Location
        <input value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>
      <label>
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. moved to turf field" />
      </label>
      <div className="meta-actions">
        <button type="submit">Save changes</button>
        <button type="button" className="link-btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
