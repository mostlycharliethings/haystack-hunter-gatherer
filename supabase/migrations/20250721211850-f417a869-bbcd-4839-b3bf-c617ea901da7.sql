-- Add discovery-crawler to module_settings if not exists
INSERT INTO public.module_settings (module_name, enabled) 
VALUES ('discovery-crawler', true)
ON CONFLICT (module_name) DO UPDATE SET enabled = true;

-- Create a cron job to run discovery-crawler weekly on Sundays at 2 AM
SELECT cron.schedule(
  'discovery-crawler-weekly',
  '0 2 * * 0', -- Every Sunday at 2 AM
  $$
  SELECT
    net.http_post(
        url:='https://prgzopfgxpcmducwrpwl.supabase.co/functions/v1/search-cron-scheduler',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZ3pvcGZneHBjbWR1Y3dycHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MDIxNzksImV4cCI6MjA2ODM3ODE3OX0.dODEjXD6ieJLFvheJTwLqvnw4XznmWlBKUI-hh9RH60"}'::jsonb,
        body:=concat('{"module": "discovery-crawler", "scheduled": true, "time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);