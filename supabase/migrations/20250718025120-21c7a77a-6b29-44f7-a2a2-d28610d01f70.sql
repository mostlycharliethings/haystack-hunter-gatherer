-- Create search_configs table
CREATE TABLE public.search_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  qualifier TEXT,
  sub_qualifier TEXT,
  year_start INTEGER,
  year_end INTEGER,
  price_threshold NUMERIC NOT NULL,
  price_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  location TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create listings table
CREATE TABLE public.listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  price NUMERIC NOT NULL,
  location TEXT NOT NULL,
  distance NUMERIC,
  source TEXT NOT NULL,
  tier INTEGER NOT NULL DEFAULT 1,
  url TEXT NOT NULL,
  image_url TEXT,
  posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  search_config_id UUID NOT NULL REFERENCES public.search_configs(id) ON DELETE CASCADE
);

-- Enable Row Level Security
ALTER TABLE public.search_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for search_configs (public access for now)
CREATE POLICY "Allow all operations on search_configs" 
ON public.search_configs 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create RLS policies for listings (public access for now)
CREATE POLICY "Allow all operations on listings" 
ON public.listings 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_search_configs_updated_at
  BEFORE UPDATE ON public.search_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_search_configs_active ON public.search_configs(is_active);
CREATE INDEX idx_listings_search_config_id ON public.listings(search_config_id);
CREATE INDEX idx_listings_discovered_at ON public.listings(discovered_at DESC);