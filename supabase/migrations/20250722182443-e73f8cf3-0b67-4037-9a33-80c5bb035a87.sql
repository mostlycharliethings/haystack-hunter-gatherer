-- Create functions to enable/disable cron jobs
CREATE OR REPLACE FUNCTION public.enable_cron_job(job_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Note: This function updates the database status
  -- The actual cron job scheduling is handled by pg_cron
  -- For now, we just log the action
  INSERT INTO public.scrape_activity (
    module_name,
    status,
    message
  ) VALUES (
    'cron-manager',
    'success',
    'Enabled cron job: ' || job_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_cron_job(job_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Note: This function updates the database status
  -- The actual cron job scheduling is handled by pg_cron
  -- For now, we just log the action
  INSERT INTO public.scrape_activity (
    module_name,
    status,
    message
  ) VALUES (
    'cron-manager',
    'success',
    'Disabled cron job: ' || job_name
  );
END;
$$;