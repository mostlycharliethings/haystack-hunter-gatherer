-- Add unique constraint to secondary_sources on normalized URL to prevent duplicates
ALTER TABLE public.secondary_sources 
ADD CONSTRAINT unique_secondary_sources_url 
UNIQUE (url);

-- Add trigger to ensure URLs are normalized (trimmed and lowercase) before insert/update
CREATE OR REPLACE FUNCTION normalize_url()
RETURNS TRIGGER AS $$
BEGIN
  NEW.url = TRIM(LOWER(NEW.url));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_url_secondary_sources
  BEFORE INSERT OR UPDATE ON public.secondary_sources
  FOR EACH ROW
  EXECUTE FUNCTION normalize_url();

-- Add similar normalization to tertiary_sources and listings for consistency
CREATE TRIGGER normalize_url_tertiary_sources
  BEFORE INSERT OR UPDATE ON public.tertiary_sources
  FOR EACH ROW
  EXECUTE FUNCTION normalize_url();

CREATE TRIGGER normalize_url_listings
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION normalize_url();