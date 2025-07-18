-- Create Craigslist areas table for location-based searching
CREATE TABLE public.craigslist_areas (
  id SERIAL PRIMARY KEY,
  area_id TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL,
  hostname TEXT NOT NULL,
  description TEXT NOT NULL,
  short_description TEXT,
  country TEXT NOT NULL,
  region TEXT,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(11, 7) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for geographic queries
CREATE INDEX idx_craigslist_areas_coordinates ON public.craigslist_areas (latitude, longitude);
CREATE INDEX idx_craigslist_areas_hostname ON public.craigslist_areas (hostname);

-- Create sub-areas table for more granular location targeting
CREATE TABLE public.craigslist_sub_areas (
  id SERIAL PRIMARY KEY,
  parent_area_id TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (parent_area_id) REFERENCES public.craigslist_areas(area_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.craigslist_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.craigslist_sub_areas ENABLE ROW LEVEL SECURITY;

-- Create policies (read-only for all users)
CREATE POLICY "Areas are viewable by everyone" 
ON public.craigslist_areas 
FOR SELECT 
USING (true);

CREATE POLICY "Sub-areas are viewable by everyone" 
ON public.craigslist_sub_areas 
FOR SELECT 
USING (true);

-- Function to find nearby Craigslist areas within radius
CREATE OR REPLACE FUNCTION get_nearby_craigslist_areas(
  user_lat DECIMAL,
  user_lon DECIMAL,
  radius_miles INTEGER DEFAULT 50
) RETURNS TABLE (
  area_id TEXT,
  hostname TEXT,
  description TEXT,
  distance_miles DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ca.area_id,
    ca.hostname,
    ca.description,
    calculate_distance(user_lat, user_lon, ca.latitude, ca.longitude) as distance_miles
  FROM public.craigslist_areas ca
  WHERE calculate_distance(user_lat, user_lon, ca.latitude, ca.longitude) <= radius_miles
  ORDER BY distance_miles ASC;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_craigslist_areas_updated_at
BEFORE UPDATE ON public.craigslist_areas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();