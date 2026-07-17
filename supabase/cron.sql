-- Schedule the poll-cron Edge Function with Supabase Cron (pg_cron + pg_net).
-- This both keeps the free-tier project alive (real HTTP activity every few
-- hours) and rolls the poll open ~2 days before each game.
--
-- Prereqs:
--   1. Deploy the function:  supabase functions deploy poll-cron --no-verify-jwt
--   2. Run this in the SQL editor, replacing YOUR-PROJECT and YOUR-ANON-KEY.
-- Or skip the SQL entirely and use the Dashboard → Integrations → Cron UI to
-- schedule an HTTP POST to the same function URL.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 6 hours: 4 API hits/day keeps the project awake, and the poll flips to
-- `open` within a few hours of the 2-days-prior mark.
select cron.schedule(
  'poll-cron',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT.functions.supabase.co/poll-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-ANON-KEY'
    )
  );
  $$
);

-- Inspect / remove:
--   select * from cron.job;
--   select cron.unschedule('poll-cron');
