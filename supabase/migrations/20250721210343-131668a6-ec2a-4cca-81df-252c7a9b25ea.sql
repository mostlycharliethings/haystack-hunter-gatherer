-- Fix Bicycle Blue Book timeout issue
UPDATE secondary_sources 
SET searchable = false, 
    searchable_false_reason = 'JS-heavy site; requires dynamic rendering (timeout errors)'
WHERE source = 'Bicycle Blue Book';

-- Add some sample tertiary sources for fallback
INSERT INTO tertiary_sources (search_config_id, title, location, source, url, price, posted_at, tier, relevance_score, searchable)
VALUES 
  -- Generic marketplace fallbacks that work well
  (
    (SELECT id FROM search_configs LIMIT 1),
    'Sample Marketplace Listing',
    'Denver, CO',
    'Facebook Marketplace',
    'https://facebook.com/marketplace',
    1000,
    NOW(),
    3,
    0.4,
    true
  ),
  (
    (SELECT id FROM search_configs LIMIT 1),
    'Sample Classified Listing', 
    'Boulder, CO',
    'OfferUp',
    'https://offerup.com',
    800,
    NOW(),
    3,
    0.3,
    true
  )
ON CONFLICT DO NOTHING;