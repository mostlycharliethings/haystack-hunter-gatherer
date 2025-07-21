-- Add searchable_false_reason column for auditing
ALTER TABLE secondary_sources ADD COLUMN IF NOT EXISTS searchable_false_reason text;
ALTER TABLE tertiary_sources ADD COLUMN IF NOT EXISTS searchable_false_reason text;

-- Update existing non-searchable sources with reasons
UPDATE secondary_sources SET searchable_false_reason = 'Forum/community site' WHERE searchable = false AND (url LIKE '%forum%' OR url LIKE '%triumphrat%');
UPDATE secondary_sources SET searchable_false_reason = 'Parts/accessories site' WHERE searchable = false AND (url LIKE '%parts%' OR url LIKE '%motorcyclespareparts%');
UPDATE secondary_sources SET searchable_false_reason = 'Classified directory' WHERE searchable = false AND url LIKE '%gumtree%';