-- Remove normalize_url trigger from listings table to preserve full URLs
DROP TRIGGER IF EXISTS normalize_url_listings ON public.listings;

-- Add functional indexes for true case-insensitive uniqueness on source tables
CREATE UNIQUE INDEX IF NOT EXISTS idx_tertiary_sources_normalized_url 
ON public.tertiary_sources (LOWER(TRIM(url)));

-- Add functional index for listings (non-unique since we want to preserve exact URLs)
CREATE INDEX IF NOT EXISTS idx_listings_normalized_url 
ON public.listings (LOWER(TRIM(url)));