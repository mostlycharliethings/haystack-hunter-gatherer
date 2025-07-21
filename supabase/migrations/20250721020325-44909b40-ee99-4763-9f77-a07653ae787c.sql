-- Add missing columns to listings table
ALTER TABLE public.listings 
ADD COLUMN latitude NUMERIC,
ADD COLUMN longitude NUMERIC;

-- Create the missing update_search_config_last_run function
CREATE OR REPLACE FUNCTION public.update_search_config_last_run(p_config_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.search_configs 
  SET updated_at = now() 
  WHERE id = p_config_id;
END;
$$;