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