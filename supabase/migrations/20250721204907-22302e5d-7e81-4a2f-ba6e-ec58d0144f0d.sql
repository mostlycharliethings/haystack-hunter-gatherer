-- Create cron job to run craigslist-searcher every 45 minutes
SELECT cron.schedule(
  'craigslist-searcher-cron',
  '0,45 * * * *', -- Every 45 minutes
  $$
  SELECT
    net.http_post(
        url:='https://prgzopfgxpcmducwrpwl.supabase.co/functions/v1/search-cron-scheduler',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZ3pvcGZneHBjbWR1Y3dycHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MDIxNzksImV4cCI6MjA2ODM3ODE3OX0.dODEjXD6ieJLFvheJTwLqvnw4XznmWlBKUI-hh9RH60"}'::jsonb,
        body:='{"module": "craigslist-searcher"}'::jsonb
    ) as request_id;
  $$
);