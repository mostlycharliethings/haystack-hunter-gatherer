-- Create the missing scrape_activity table for logging module executions
CREATE TABLE public.scrape_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_name TEXT NOT NULL,
  search_config_id UUID REFERENCES public.search_configs(id) ON DELETE SET NULL,
  status TEXT NOT NULL, -- 'started', 'success', 'failed'
  message TEXT,
  listings_found INTEGER DEFAULT 0,
  sources_processed INTEGER DEFAULT 0,
  execution_time_ms INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scrape_activity ENABLE ROW LEVEL SECURITY;

-- Create policy for scrape_activity
CREATE POLICY "Allow all operations on scrape_activity" 
ON public.scrape_activity 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_scrape_activity_module_name ON public.scrape_activity(module_name);
CREATE INDEX idx_scrape_activity_created_at ON public.scrape_activity(created_at);
CREATE INDEX idx_scrape_activity_status ON public.scrape_activity(status);

-- Create the log_scrape_activity RPC function
CREATE OR REPLACE FUNCTION public.log_scrape_activity(
  p_module_name TEXT,
  p_search_config_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'started',
  p_message TEXT DEFAULT NULL,
  p_listings_found INTEGER DEFAULT 0,
  p_sources_processed INTEGER DEFAULT 0,
  p_execution_time_ms INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  activity_id UUID;
BEGIN
  INSERT INTO public.scrape_activity (
    module_name,
    search_config_id,
    status,
    message,
    listings_found,
    sources_processed,
    execution_time_ms,
    metadata
  ) VALUES (
    p_module_name,
    p_search_config_id,
    p_status,
    p_message,
    p_listings_found,
    p_sources_processed,
    p_execution_time_ms,
    p_metadata
  ) RETURNING id INTO activity_id;
  
  RETURN activity_id;
END;
$$;

-- Set up cron jobs for automatic module execution
-- First ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule primary search every 30 minutes
SELECT cron.schedule(
  'primary-search-cron',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://prgzopfgxpcmducwrpwl.supabase.co/functions/v1/search-cron-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZ3pvcGZneHBjbWR1Y3dycHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MDIxNzksImV4cCI6MjA2ODM3ODE3OX0.dODEjXD6ieJLFvheJTwLqvnw4XznmWlBKUI-hh9RH60"}'::jsonb,
    body := '{"module": "primary-search"}'::jsonb
  );
  $$
);

-- Schedule extended search every 2 hours
SELECT cron.schedule(
  'extended-search-cron',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://prgzopfgxpcmducwrpwl.supabase.co/functions/v1/search-cron-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZ3pvcGZneHBjbWR1Y3dycHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MDIxNzksImV4cCI6MjA2ODM3ODE3OX0.dODEjXD6ieJLFvheJTwLqvnw4XznmWlBKUI-hh9RH60"}'::jsonb,
    body := '{"module": "extended-search"}'::jsonb
  );
  $$
);

-- Schedule discovery crawler every 6 hours
SELECT cron.schedule(
  'discovery-crawler-cron',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://prgzopfgxpcmducwrpwl.supabase.co/functions/v1/search-cron-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZ3pvcGZneHBjbWR1Y3dycHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MDIxNzksImV4cCI6MjA2ODM3ODE3OX0.dODEjXD6ieJLFvheJTwLqvnw4XznmWlBKUI-hh9RH60"}'::jsonb,
    body := '{"module": "discovery-crawler"}'::jsonb
  );
  $$
);

-- Schedule contextual finder daily
SELECT cron.schedule(
  'contextual-finder-cron',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://prgzopfgxpcmducwrpwl.supabase.co/functions/v1/search-cron-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZ3pvcGZneHBjbWR1Y3dycHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MDIxNzksImV4cCI6MjA2ODM3ODE3OX0.dODEjXD6ieJLFvheJTwLqvnw4XznmWlBKUI-hh9RH60"}'::jsonb,
    body := '{"module": "contextual-finder"}'::jsonb
  );
  $$
);

-- Schedule notifier daily at 9 AM
SELECT cron.schedule(
  'notifier-cron',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://prgzopfgxpcmducwrpwl.supabase.co/functions/v1/search-cron-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZ3pvcGZneHBjbWR1Y3dycHdsIiwicm9sZSI6ImFub24"}'::jsonb,
    body := '{"module": "notifier"}'::jsonb
  );
  $$
);