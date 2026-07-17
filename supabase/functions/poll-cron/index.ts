// Supabase Edge Function: poll-cron.
//
// Runs on a schedule (see supabase/cron.sql). Two jobs in one:
//   1. Keep-alive — being invoked over HTTP is real API activity, which stops a
//      free-tier project from pausing after ~7 days idle.
//   2. Roll the poll — upsert the next game's row and flip it to `open` once
//      we're within OPEN_LEAD_DAYS of kickoff; mark finished games `closed`.
//
// It never touches `opened_manually`, `time`, `location`, or `note`, so manual
// opens and organizer edits are preserved.
//
// Deploy:  supabase functions deploy poll-cron --no-verify-jwt
// Optional: supabase secrets set TEAM_TZ=America/New_York
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { nextGame, TEAM_TZ } from "../_shared/schedule.ts";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    // Service role bypasses RLS; anon also works since policies are open.
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const g = nextGame(TEAM_TZ);
  const shouldOpen = Date.now() >= g.opensAt.getTime();

  // Base row — omit `status` when not opening yet so we never downgrade a poll
  // someone opened manually.
  const row: Record<string, unknown> = {
    game_date: g.date,
    slot_id: g.slot.id,
    kickoff_at: g.kickoff.toISOString(),
    opens_at: g.opensAt.toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (shouldOpen) row.status = "open";

  const up = await supabase.from("game_meta").upsert(row, { onConflict: "game_date" });

  // Close games whose kickoff (+grace) is well past.
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const closed = await supabase
    .from("game_meta")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .lt("kickoff_at", cutoff)
    .neq("status", "closed");

  return Response.json({
    ok: !up.error && !closed.error,
    tz: TEAM_TZ,
    game: g.date,
    status: shouldOpen ? "open" : "scheduled",
    error: up.error?.message ?? closed.error?.message ?? null,
  });
});
