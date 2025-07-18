-- Add email field to search_configs table
ALTER TABLE search_configs ADD COLUMN email TEXT;

-- Create index for email lookups
CREATE INDEX idx_search_configs_email ON search_configs(email);

-- Update RLS policies to include email field (users can only see/edit their own configs)
-- Existing policies already cover this via user_id, so no changes needed