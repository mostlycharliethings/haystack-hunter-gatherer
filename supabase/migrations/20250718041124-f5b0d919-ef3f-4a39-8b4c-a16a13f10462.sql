-- Create secondary_sources table for contextual finder results
CREATE TABLE public.secondary_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_config_id UUID NOT NULL REFERENCES public.search_configs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  price NUMERIC NOT NULL,
  location TEXT NOT NULL,
  distance NUMERIC,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  image_url TEXT,
  posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  relevance_score NUMERIC DEFAULT 0.5,
  context_type TEXT, -- 'similar_model', 'adjacent_category', 'brand_related'
  tier INTEGER NOT NULL DEFAULT 2
);

-- Create tertiary_sources table for discovery crawler results  
CREATE TABLE public.tertiary_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_config_id UUID NOT NULL REFERENCES public.search_configs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  price NUMERIC NOT NULL,
  location TEXT NOT NULL,
  distance NUMERIC,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  image_url TEXT,
  posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  relevance_score NUMERIC DEFAULT 0.3,
  discovery_type TEXT, -- 'alternative_brand', 'broader_category', 'trending'
  tier INTEGER NOT NULL DEFAULT 3
);

-- Enable Row Level Security
ALTER TABLE public.secondary_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tertiary_sources ENABLE ROW LEVEL SECURITY;

-- Create policies for secondary_sources
CREATE POLICY "Allow all operations on secondary_sources" 
ON public.secondary_sources 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create policies for tertiary_sources
CREATE POLICY "Allow all operations on tertiary_sources" 
ON public.tertiary_sources 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_secondary_sources_search_config_id ON public.secondary_sources(search_config_id);
CREATE INDEX idx_secondary_sources_price ON public.secondary_sources(price);
CREATE INDEX idx_secondary_sources_discovered_at ON public.secondary_sources(discovered_at);
CREATE INDEX idx_secondary_sources_relevance_score ON public.secondary_sources(relevance_score);

CREATE INDEX idx_tertiary_sources_search_config_id ON public.tertiary_sources(search_config_id);
CREATE INDEX idx_tertiary_sources_price ON public.tertiary_sources(price);
CREATE INDEX idx_tertiary_sources_discovered_at ON public.tertiary_sources(discovered_at);
CREATE INDEX idx_tertiary_sources_relevance_score ON public.tertiary_sources(relevance_score);

-- Create trigger for updated_at timestamps
CREATE TRIGGER update_secondary_sources_updated_at
BEFORE UPDATE ON public.secondary_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tertiary_sources_updated_at
BEFORE UPDATE ON public.tertiary_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();