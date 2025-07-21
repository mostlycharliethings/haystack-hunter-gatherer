-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule discovery-crawler to run every 6 hours
SELECT cron.schedule(
  'discovery-crawler-job',
  '0 */6 * * *', -- Every 6 hours at the top of the hour
  $$
  SELECT
    net.http_post(
        url:='https://prgzopfgxpcmducwrpwl.supabase.co/functions/v1/discovery-crawler',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZ3pvcGZneHBjbWR1Y3dycHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MDIxNzksImV4cCI6MjA2ODM3ODE3OX0.dODEjXD6ieJLFvheJTwLqvnw4XznmWlBKUI-hh9RH60"}'::jsonb,
        body:='{"scheduled": true}'::jsonb
    ) as request_id;
  $$
);