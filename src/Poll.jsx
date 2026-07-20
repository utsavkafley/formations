import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import store, { hasRemote } from "./store.js";
import {
  getNextGame,
  applyMeta,
  prettyDate,
  prettyTime,
  prettyDay,
  gameName,
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
  const [connError, setConnError] = useState(false);
  const [sheet, setSheet] = useState(null); // null | "vote" | "meta"
  const autoOpened = useRef(false);

  const eff = applyMeta(game, data.meta);
  const open = isPollOpen(game, data.meta?.openedManually);

  const reload = useCallback(async () => {
    try {
      const d = await store.fetchGame(game.date);
      setData(d);
      setConnError(false);
    } catch {
      setConnError(true);
    } finally {
      setLoading(false);
    }
  }, [game.date]);

  useEffect(() => {
    reload();
    const unsub = store.subscribe(game.date, reload);
    return () => unsub();
  }, [game.date, reload]);

  const myVote = me ? data.votes[me.id]?.status : null;

  // Prompt to vote on arrival — once — if the poll is open and there's no reply.
  useEffect(() => {
    if (!loading && open && !myVote && !autoOpened.current) {
      autoOpened.current = true;
      setSheet("vote");
    }
  }, [loading, open, myVote]);

  const roster = CORE_SQUAD;
  const inList = roster.filter((m) => data.votes[m.id]?.status === "in");
  const outList = roster.filter((m) => data.votes[m.id]?.status === "out");
  const noResp = roster.filter((m) => !data.votes[m.id]);
  const totalIn = inList.length + data.guests.length;

  function pickMe(id) {
    const member = roster.find((m) => m.id === id);
    setMe(member);
    setMeState(member ? { id: member.id, name: member.name } : null);
  }

  async function vote(status) {
    if (!me) return;
    await store.setVote(game.date, { memberId: me.id, memberName: me.name, status, deviceId });
    if (status === "out") {
      const mine = data.guests.filter((g) => g.hostMemberId === me.id);
      await Promise.all(mine.map((g) => store.removeGuest(game.date, g.id)));
    }
    reload();
  }

  async function addGuest(name) {
    if (!name.trim() || !me) return;
    await store.addGuest(game.date, {
      name: name.trim(),
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

  async function openNow() {
    await store.openPoll(game.date, {
      slotId: game.slotId,
      kickoffAt: game.when.toISOString(),
      opensAt: game.opensAt.toISOString(),
    });
    reload();
  }

  const rsvpLabel =
    myVote === "in" ? "✅ You're IN · tap to change"
    : myVote === "out" ? "🚫 You're OUT · tap to change"
    : "Tap to RSVP";

  return (
    <div className="poll">
      <div className="poll-shell">
        {connError && hasRemote && (
          <div className="conn-banner" role="alert">
            ⚠️ Can’t reach the database — RSVPs won’t save right now. The project may be
            paused or its keys aren’t set. Retrying automatically.
          </div>
        )}

        <header className="hero">
          <div className="hero-kicker">Pickup · Next game</div>
          <h1 className="hero-title">{prettyDate(game.date)}</h1>
          <div className="hero-meta">
            <span className="chip">🕕 {prettyTime(eff.time)}</span>
            <span className="chip">📍 {eff.location}</span>
          </div>
          {eff.note && <div className="hero-note">ℹ️ {eff.note}</div>}
          <button className="hero-edit" onClick={() => setSheet("meta")}>
            Edit time / location
          </button>
        </header>

        {open ? (
          <>
            <div className="tally">
              <div className="stat stat-in">
                <b>{totalIn}</b>
                <span>In</span>
              </div>
              <div className="stat stat-out">
                <b>{outList.length}</b>
                <span>Out</span>
              </div>
              <div className="stat">
                <b>{noResp.length}</b>
                <span>No reply</span>
              </div>
            </div>

            <section>
              <div className="roster-block in">
                <h3>
                  Going <span className="count">{totalIn}</span>
                </h3>
                {totalIn === 0 ? (
                  <div className="roster-empty">Nobody yet — be the first.</div>
                ) : (
                  <div className="namechips">
                    {inList.map((m) => (
                      <span key={m.id} className="namechip">
                        {m.name}
                        {me?.id === m.id && <span className="you">you</span>}
                      </span>
                    ))}
                    {data.guests.map((g) => (
                      <span key={g.id} className="namechip guest" title={`Guest of ${g.hostName}`}>
                        {g.name} +1
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {outList.length > 0 && (
                <div className="roster-block out">
                  <h3>
                    Can’t make it <span className="count">{outList.length}</span>
                  </h3>
                  <div className="namechips">
                    {outList.map((m) => (
                      <span key={m.id} className="namechip">
                        {m.name}
                        {me?.id === m.id && <span className="you">you</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="roster-block">
                <h3>
                  No reply <span className="count">{noResp.length}</span>
                </h3>
                <div className="namechips">
                  {noResp.map((m) => (
                    <span key={m.id} className="namechip" style={{ opacity: 0.6 }}>
                      {m.name}
                      {me?.id === m.id && <span className="you">you</span>}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="teaser">
            <div className="teaser-lock">🔒 RSVP opens {prettyDay(game.opensAt)}</div>
            <div className="teaser-sub">
              {daysUntil(game.opensAt) === 0
                ? "Opening today — check back shortly, or open it now."
                : `In ${daysUntil(game.opensAt)} day${daysUntil(game.opensAt) === 1 ? "" : "s"}. Come back then to mark yourself IN or OUT.`}
            </div>
            <button className="rsvp-btn none" style={{ position: "static", maxWidth: 260, margin: "0 auto" }} onClick={openNow}>
              Open RSVP now
            </button>
          </div>
        )}

        <button className="build-cta" onClick={() => onNavigate("/build")}>
          Organizer → balance teams &amp; build formation
        </button>

        {!hasRemote && (
          <div className="local-warn">
            ⚠️ Local-only mode — add Supabase keys to share across devices. See <code>SETUP.md</code>.
          </div>
        )}
      </div>

      {open && (
        <div className="rsvp-bar">
          <button
            className={`rsvp-btn ${myVote || "none"}`}
            onClick={() => setSheet("vote")}
          >
            {rsvpLabel}
          </button>
        </div>
      )}

      {sheet === "vote" && (
        <Sheet title="You in?" subtitle={gameName(eff)} onClose={() => setSheet(null)}>
          <label className="field-label">You are</label>
          <select className="select" value={me?.id || ""} onChange={(e) => pickMe(e.target.value)}>
            <option value="" disabled>
              Pick your name…
            </option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <div className="vote2">
            <button
              className={`v-btn in ${myVote === "in" ? "on" : ""}`}
              disabled={!me}
              onClick={() => vote("in")}
            >
              ✅ I’m IN
            </button>
            <button
              className={`v-btn out ${myVote === "out" ? "on" : ""}`}
              disabled={!me}
              onClick={() => vote("out")}
            >
              🚫 Can’t make it
            </button>
          </div>

          {myVote === "in" && (
            <GuestBlock
              guests={data.guests.filter((g) => g.hostMemberId === me.id)}
              onAdd={addGuest}
              onRemove={removeGuest}
            />
          )}

          <button className="sheet-done" onClick={() => setSheet(null)}>
            Done
          </button>
        </Sheet>
      )}

      {sheet === "meta" && (
        <Sheet title="Edit game details" subtitle={gameName(eff)} onClose={() => setSheet(null)}>
          <MetaEditor
            game={eff}
            onSave={async (m) => {
              await store.setMeta(game.date, m);
              reload();
              setSheet(null);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ title, subtitle, onClose, children }) {
  // Lock body scroll + close on Escape while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h2 className="sheet-title">{title}</h2>
        <div className="sheet-sub">{subtitle}</div>
        {children}
      </div>
    </div>
  );
}

function GuestBlock({ guests, onAdd, onRemove }) {
  const [name, setName] = useState("");
  return (
    <div className="guest2">
      <div className="guest2-title">🎉 Bringing a guest?</div>
      <form
        className="guest2-form"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(name);
          setName("");
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name…" aria-label="Guest name" />
        <button type="submit">+ Add</button>
      </form>
      {guests.length > 0 && (
        <div className="guest2-chips">
          {guests.map((g) => (
            <span key={g.id} className="guest2-chip">
              {g.name}
              <button onClick={() => onRemove(g.id)} aria-label={`Remove ${g.name}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MetaEditor({ game, onSave }) {
  const [time, setTime] = useState(game.time);
  const [location, setLocation] = useState(game.location);
  const [note, setNote] = useState(game.note || "");
  return (
    <form
      className="meta-editor2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ time, location, note: note.trim() || null });
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
      <button className="sheet-done" type="submit">
        Save changes
      </button>
    </form>
  );
}
