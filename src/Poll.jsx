import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import store, { hasRemote } from "./store.js";
import { getNextGame, applyMeta, prettyDate, prettyTime, gameName, dateParts } from "./schedule.js";
import { getDeviceId, getMe, setMe } from "./device.js";
import { CORE_SQUAD } from "./squad.js";
import { STRENGTHS } from "./strengths.js";

export default function Poll({ onNavigate }) {
  const game = useMemo(() => getNextGame(), []);
  const deviceId = useMemo(() => getDeviceId(), []);
  const [me, setMeState] = useState(() => getMe());
  const [data, setData] = useState({ votes: {}, guests: [], meta: null });
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState(false);
  const [sheet, setSheet] = useState(null); // null | "vote" | "meta" | "feedback"
  const [saveState, setSaveState] = useState(null); // null | "saving" | "saved" | "error"
  const [feedbackTarget, setFeedbackTarget] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const autoOpened = useRef(false);
  const recovered = useRef(false);
  const feedbackCount = useRef(0); // ratings submitted this session (chain caps at 3)

  const eff = applyMeta(game, data.meta);
  const pendingKey = `yolo.pendingVote.${game.date}`;

  const reload = useCallback(async () => {
    const d = await store.fetchGame(game.date);
    setData(d);
    setConnError(false);
    setLoading(false);
    return d;
  }, [game.date]);

  useEffect(() => {
    reload().catch(() => {
      setConnError(true);
      setLoading(false);
    });
    const unsub = store.subscribe(game.date, () => reload().catch(() => {}));
    return () => unsub();
  }, [game.date, reload]);

  const myVote = me ? data.votes[me.id]?.status : null;
  // Mirror of the current vote, kept in a ref so closeVote() reads a fresh value
  // even if the sheet is closed in the same tick as tapping "I'm IN".
  const voteRef = useRef(myVote);
  useEffect(() => {
    voteRef.current = myVote;
  }, [myVote]);

  // Always open the RSVP sheet on arrival — even for people who already voted —
  // so re-voting (or retrying after a failed save) is one tap away.
  useEffect(() => {
    if (!loading && !autoOpened.current) {
      autoOpened.current = true;
      setSheet("vote");
    }
  }, [loading]);

  // Stale-tab guard: phones keep tabs alive for days, but `game` is computed at
  // mount — a vote cast through last week's page would land on the OLD game's
  // date. When the tab resumes and the next game has rolled over, reload.
  useEffect(() => {
    const check = () => {
      if (getNextGame().date !== game.date) window.location.reload();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const id = setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      clearInterval(id);
    };
  }, [game.date]);

  // Save a vote and prove it landed: a write that "succeeds" but isn't in the
  // DB afterwards is exactly the failure people reported, so re-read and
  // verify. On any failure the choice is parked in localStorage and retried on
  // the next visit, so a dead connection can't silently swallow an RSVP.
  const saveVote = useCallback(
    async (status, member) => {
      let lastError;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await store.setVote(game.date, {
            memberId: member.id,
            memberName: member.name,
            status,
            deviceId,
          });
          const fresh = await reload();
          if (fresh.votes[member.id]?.status === status) {
            localStorage.removeItem(pendingKey);
            return fresh;
          }
          lastError = new Error("vote did not persist");
        } catch (err) {
          lastError = err;
        }
      }
      localStorage.setItem(pendingKey, JSON.stringify({ id: member.id, name: member.name, status }));
      throw lastError;
    },
    [game.date, deviceId, reload, pendingKey],
  );

  // A vote parked by a failed save gets retried once, quietly, on next load.
  useEffect(() => {
    if (loading || connError || recovered.current) return;
    const raw = localStorage.getItem(pendingKey);
    if (!raw) return;
    recovered.current = true;
    try {
      const p = JSON.parse(raw);
      if (p?.id && data.votes[p.id]?.status !== p.status) {
        saveVote(p.status, { id: p.id, name: p.name }).catch(() => {});
      } else {
        localStorage.removeItem(pendingKey);
      }
    } catch {
      localStorage.removeItem(pendingKey);
    }
  }, [loading, connError, data.votes, pendingKey, saveVote]);

  const roster = CORE_SQUAD;
  const inList = roster.filter((m) => data.votes[m.id]?.status === "in");
  const outList = roster.filter((m) => data.votes[m.id]?.status === "out");
  const noResp = roster.filter((m) => !data.votes[m.id]);
  const totalIn = inList.length + data.guests.length;

  function pickMe(id) {
    const member = roster.find((m) => m.id === id);
    setMe(member);
    setMeState(member ? { id: member.id, name: member.name } : null);
    setSaveState(null);
  }

  async function vote(status) {
    if (!me) return;
    setSaveState("saving");
    try {
      await saveVote(status, me);
      voteRef.current = status;
      if (status === "out") {
        const mine = data.guests.filter((g) => g.hostMemberId === me.id);
        await Promise.all(mine.map((g) => store.removeGuest(game.date, g.id)));
        await reload();
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function addGuest(name) {
    if (!name.trim() || !me) return;
    try {
      await store.addGuest(game.date, {
        name: name.trim(),
        hostMemberId: me.id,
        hostName: me.name,
        deviceId,
      });
      await reload();
    } catch {
      setSaveState("error");
    }
  }

  async function removeGuest(id) {
    try {
      await store.removeGuest(game.date, id);
      await reload();
    } catch {
      setSaveState("error");
    }
  }

  // Pick a co-attendee of a past game the rater played in, whom they haven't
  // rated for that game yet. Biases toward the least-rated player to spread
  // coverage. Returns null when there's nothing sensible to ask.
  async function pickFeedbackTarget() {
    const games = await store.fetchAttendedGames(me.id, game.date);
    if (!games.length) return null;
    const all = await store.fetchAllFeedback();
    const counts = {};
    const ratedByMe = new Set();
    for (const r of all) {
      counts[r.subject_id] = (counts[r.subject_id] || 0) + 1;
      if (r.rater_id === me.id) ratedByMe.add(`${r.subject_id}|${r.game_date}`);
    }
    for (const g of games) {
      const attendees = await store.fetchAttendees(g);
      const eligible = attendees.filter(
        (a) => a.memberId !== me.id && !ratedByMe.has(`${a.memberId}|${g}`),
      );
      if (eligible.length) {
        eligible.sort(
          (a, b) => (counts[a.memberId] || 0) - (counts[b.memberId] || 0) || Math.random() - 0.5,
        );
        const pick = eligible[0];
        return { subjectId: pick.memberId, subjectName: pick.memberName, gameDate: g };
      }
    }
    return null;
  }

  // Runs whenever the RSVP sheet closes (Done, ✕, Escape, or backdrop). If the
  // member is IN, prompt once per poll to rate a teammate from a past game.
  async function closeVote() {
    const askedKey = `yolo.feedbackAsked.${game.date}`;
    if (voteRef.current === "in" && me && !localStorage.getItem(askedKey)) {
      try {
        const target = await pickFeedbackTarget();
        if (target) {
          localStorage.setItem(askedKey, "1");
          feedbackCount.current = 0;
          setFeedbackTarget(target);
          setSheet("feedback");
          return;
        }
      } catch {
        /* feedback is best-effort — never block closing the RSVP */
      }
    }
    setSheet(null);
  }

  // Save the rating, then chain to the next eligible teammate — up to 3 per
  // session so the ask stays light. Any failure just ends the chain.
  async function submitFeedback({ performance, strengths }) {
    await store.addFeedback({
      subjectId: feedbackTarget.subjectId,
      raterId: me.id,
      gameDate: feedbackTarget.gameDate,
      performance,
      strengths,
    });
    feedbackCount.current += 1;
    if (feedbackCount.current < 3) {
      try {
        const next = await pickFeedbackTarget();
        if (next) {
          setFeedbackTarget(next);
          return;
        }
      } catch {
        /* end the chain */
      }
    }
    setSheet(null);
  }

  function openVoteSheet() {
    setSaveState(null);
    setSheet("vote");
  }

  // The name is part of the label on purpose: if someone's device is remembering
  // the wrong person, their own status line is where they'll notice it.
  const statusLabel =
    myVote === "in" ? `${me?.name} · You're IN`
    : myVote === "out" ? `${me?.name} · You're OUT`
    : "Tap to RSVP";

  return (
    <div className="poll">
      <div className="poll-shell">
        {connError && hasRemote && (
          <div className="conn-banner" role="alert">
            Can’t reach the server — your RSVP won’t save yet. It’ll retry automatically.
          </div>
        )}

        <header className="hero">
          <button className="hero-edit" onClick={() => setSheet("meta")} aria-label="Edit game details">
            ✎
          </button>
          <div className="hero-kicker">Next game</div>
          <h1 className="hero-title">
            <span>{dateParts(game.date).weekday}</span>
            {dateParts(game.date).monthDay}
          </h1>
          <div className="hero-when">
            {prettyTime(eff.time)} · {eff.location}
          </div>
          {eff.note && <div className="hero-note">{eff.note}</div>}
          <button className={`hero-rsvp ${myVote || "none"}`} onClick={openVoteSheet}>
            {myVote ? statusLabel : "Tap to RSVP"}
          </button>
        </header>

        <div className="tally">
          <div className="stat stat-in">
            <b>{totalIn}</b>
            <span>in</span>
          </div>
          <div className="stat stat-out">
            <b>{outList.length}</b>
            <span>out</span>
          </div>
          <div className="stat">
            <b>{noResp.length}</b>
            <span>no reply</span>
          </div>
        </div>

        <section className="roster-block in">
          <h3>Going</h3>
          {totalIn === 0 ? (
            <div className="roster-empty">Nobody yet — be the first.</div>
          ) : (
            <div className="namechips">
              {inList.map((m) => (
                <span key={m.id} className={`namechip ${me?.id === m.id ? "mine" : ""}`}>
                  {m.name}
                </span>
              ))}
              {data.guests.map((g) => (
                <span key={g.id} className="namechip guest" title={`Guest of ${g.hostName}`}>
                  {g.name} +1
                </span>
              ))}
            </div>
          )}
        </section>

        {outList.length > 0 && (
          <section className="roster-block out">
            <h3>Out</h3>
            <div className="namechips">
              {outList.map((m) => (
                <span key={m.id} className={`namechip ${me?.id === m.id ? "mine" : ""}`}>
                  {m.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {noResp.length > 0 && (
          <section className="roster-block">
            <button className="disclosure" onClick={() => setShowAll((v) => !v)}>
              {noResp.length} haven’t replied
              <span className="caret">{showAll ? "▲" : "▼"}</span>
            </button>
            {showAll && (
              <div className="namechips quiet">
                {noResp.map((m) => (
                  <span key={m.id} className={`namechip ${me?.id === m.id ? "mine" : ""}`}>
                    {m.name}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Player profiles live at /feature/profiles — unlisted for now. */}
        <nav className="foot-links">
          <button onClick={() => onNavigate("/build")}>Balance teams</button>
        </nav>

        {!hasRemote && (
          <div className="local-warn">
            Local-only mode — add Supabase keys to share across devices.
          </div>
        )}
      </div>

      <div className="rsvp-bar">
        <button className={`rsvp-btn ${myVote || "none"}`} onClick={openVoteSheet}>
          {statusLabel}
        </button>
      </div>

      {sheet === "vote" && (
        <Sheet title="You in?" subtitle={gameName(eff)} onClose={closeVote}>
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
              disabled={!me || saveState === "saving"}
              onClick={() => vote("in")}
            >
              I’m IN
            </button>
            <button
              className={`v-btn out ${myVote === "out" ? "on" : ""}`}
              disabled={!me || saveState === "saving"}
              onClick={() => vote("out")}
            >
              Can’t make it
            </button>
          </div>

          {saveState === "saving" && <p className="save-note">Saving…</p>}
          {saveState === "saved" && (
            <p className="save-note ok">
              Saved — {me?.name} is {myVote === "in" ? "IN" : "OUT"} for {prettyDate(game.date)}.
            </p>
          )}
          {saveState === "error" && (
            <p className="save-note err">
              Couldn’t reach the server. Your choice is saved on this phone and will be sent
              automatically — or tap again once you have signal.
            </p>
          )}

          {myVote === "in" && (
            <GuestBlock
              guests={data.guests.filter((g) => g.hostMemberId === me.id)}
              onAdd={addGuest}
              onRemove={removeGuest}
            />
          )}

          <button className="sheet-done" onClick={closeVote}>
            Done
          </button>
        </Sheet>
      )}

      {sheet === "feedback" && feedbackTarget && (
        <FeedbackSheet
          key={`${feedbackTarget.subjectId}|${feedbackTarget.gameDate}`}
          subjectName={feedbackTarget.subjectName}
          chained={feedbackCount.current > 0}
          onClose={() => setSheet(null)}
          onSubmit={submitFeedback}
        />
      )}

      {sheet === "meta" && (
        <Sheet title="Edit game details" subtitle={gameName(eff)} onClose={() => setSheet(null)}>
          <MetaEditor
            game={eff}
            onSave={async (m) => {
              await store.setMeta(game.date, m);
              await reload();
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
        <button className="sheet-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="sheet-title">{title}</h2>
        <div className="sheet-sub">{subtitle}</div>
        {children}
      </div>
    </div>
  );
}

const PERF = [
  { key: "ok", label: "Ok" },
  { key: "good", label: "Good" },
  { key: "great", label: "Great" },
];

function FeedbackSheet({ subjectName, chained, onClose, onSubmit }) {
  const [perf, setPerf] = useState(null);
  const [picked, setPicked] = useState([]);
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  return (
    <Sheet
      title="Quick rating"
      subtitle={
        chained
          ? `Saved ✓ — one more: how did ${subjectName} play?`
          : `Help balance teams — how did ${subjectName} play?`
      }
      onClose={onClose}
    >
      <label className="field-label">{subjectName}'s performance</label>
      <div className="perf-row">
        {PERF.map((p) => (
          <button
            key={p.key}
            className={`perf-pill ${p.key} ${perf === p.key ? "on" : ""}`}
            onClick={() => setPerf(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="field-label" style={{ marginTop: 20 }}>
        Strengths <span className="field-opt">· optional</span>
      </label>
      <div className="strength-pills">
        {STRENGTHS.map((s) => (
          <button
            key={s.key}
            className={`strength-pill ${picked.includes(s.key) ? "on" : ""}`}
            onClick={() => toggle(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <button className="sheet-done" disabled={!perf} onClick={() => onSubmit({ performance: perf, strengths: picked })}>
        Submit rating
      </button>
      <button className="sheet-skip" onClick={onClose}>
        Skip
      </button>
    </Sheet>
  );
}

function GuestBlock({ guests, onAdd, onRemove }) {
  const [name, setName] = useState("");
  return (
    <div className="guest2">
      <div className="guest2-title">Bringing a guest?</div>
      <form
        className="guest2-form"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(name);
          setName("");
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name…" aria-label="Guest name" />
        <button type="submit">Add</button>
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
