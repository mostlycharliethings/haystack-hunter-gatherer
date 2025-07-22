-- Create cron_jobs table to manage cron job status
CREATE TABLE public.cron_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name TEXT NOT NULL UNIQUE,
  schedule TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cron_jobs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
CREATE POLICY "Allow all operations on cron_jobs" 
ON public.cron_jobs 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Insert existing cron jobs
INSERT INTO public.cron_jobs (job_name, schedule, description) VALUES
('craigslist-searcher-cron', '0,45 * * * *', 'Craigslist searcher running every 45 minutes'),
('discovery-crawler-weekly', '0 2 * * 0', 'Discovery crawler running weekly on Sundays at 2 AM'),
('discovery-crawler-job', '0 */6 * * *', 'Discovery crawler running every 6 hours'),
('primary-search-cron', '*/30 * * * *', 'Primary search running every 30 minutes'),
('extended-search-cron', '*/45 * * * *', 'Extended search running every 45 minutes'),
('contextual-finder-cron', '0 */4 * * *', 'Contextual finder running every 4 hours'),
('notifier-daily', '0 9 * * *', 'Daily digest notifier at 9 AM');

-- Add trigger for updated_at
CREATE TRIGGER update_cron_jobs_updated_at
BEFORE UPDATE ON public.cron_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();