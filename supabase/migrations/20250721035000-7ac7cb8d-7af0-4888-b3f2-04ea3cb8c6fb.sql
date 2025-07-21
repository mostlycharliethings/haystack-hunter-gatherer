-- Create widenet_results table for Google search results
CREATE TABLE public.widenet_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_config_id uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  snippet text,
  position integer NOT NULL,
  search_query text NOT NULL,
  discovered_at timestamp with time zone NOT NULL DEFAULT now(),
  is_visited boolean DEFAULT false,
  notes text
);

-- Enable Row Level Security
ALTER TABLE public.widenet_results ENABLE ROW LEVEL SECURITY;

-- Create policy for full access (matching other tables)
CREATE POLICY "Allow all operations on widenet_results" 
ON public.widenet_results 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add index for better performance
CREATE INDEX idx_widenet_results_search_config ON public.widenet_results(search_config_id);
CREATE INDEX idx_widenet_results_discovered_at ON public.widenet_results(discovered_at DESC);