-- 1. Remove normalize_url triggers from secondary_sources and tertiary_sources
-- These triggers are corrupting external URLs
DROP TRIGGER IF EXISTS normalize_url_secondary_sources ON secondary_sources;
DROP TRIGGER IF EXISTS normalize_url_tertiary_sources ON tertiary_sources;

-- 2. Add searchable flag to secondary_sources and tertiary_sources
ALTER TABLE secondary_sources ADD COLUMN IF NOT EXISTS searchable boolean DEFAULT true;
ALTER TABLE tertiary_sources ADD COLUMN IF NOT EXISTS searchable boolean DEFAULT true;

-- 3. Mark known non-searchable sources in secondary_sources
UPDATE secondary_sources SET searchable = false 
WHERE url LIKE '%motorcycle.com/classifieds%' 
   OR url LIKE '%motorcyclespareparts.eu%'
   OR url LIKE '%triumphrat.net%'
   OR url LIKE '%gumtree.com%'
   OR url LIKE '%forums%'
   OR url LIKE '%parts%';

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_secondary_sources_searchable ON secondary_sources(searchable) WHERE searchable = true;
CREATE INDEX IF NOT EXISTS idx_tertiary_sources_searchable ON tertiary_sources(searchable) WHERE searchable = true;

-- 5. Create a function to add reliable search URL templates for known sites
CREATE OR REPLACE FUNCTION get_search_url_template(base_url text, search_term text)
RETURNS text AS $$
BEGIN
  -- Return null for non-searchable sites
  IF base_url LIKE '%forums%' OR base_url LIKE '%parts%' OR base_url LIKE '%spare%' THEN
    RETURN null;
  END IF;
  
  -- Known working patterns
  IF base_url LIKE '%reverb.com%' THEN
    RETURN base_url || '/marketplace?query=' || search_term;
  ELSIF base_url LIKE '%bhphotovideo.com%' THEN
    RETURN 'https://www.bhphotovideo.com/c/search?Ntt=' || search_term;
  ELSIF base_url LIKE '%adorama.com%' THEN
    RETURN base_url || '/l/Used-Equipment?searchinfo=' || search_term;
  ELSIF base_url LIKE '%keh.com%' THEN
    RETURN 'https://www.keh.com/shop/?s=' || search_term;
  ELSE
    -- Generic fallback
    RETURN base_url || '/search?q=' || search_term;
  END IF;
END;
$$ LANGUAGE plpgsql;