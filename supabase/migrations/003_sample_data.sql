-- Insert sample secondary sources for common categories
INSERT INTO secondary_sources (url, name, category, is_active, discovered_by, notes) VALUES
-- Motorcycle sources
('https://www.cycletrader.com', 'Cycle Trader', 'Motorcycle', true, 'manual', 'National motorcycle marketplace'),
('https://www.motorcycles.com', 'Motorcycles.com', 'Motorcycle', true, 'manual', 'Motorcycle listings and reviews'),
('https://www.chopperexchange.com', 'Chopper Exchange', 'Motorcycle', true, 'manual', 'Custom and chopper motorcycles'),

-- Camera/Photography sources  
('https://www.keh.com', 'KEH Camera', 'Camera', true, 'manual', 'Used camera equipment specialist'),
('https://www.lensrentals.com/used', 'LensRentals Used', 'Camera', true, 'manual', 'Professional camera gear'),
('https://www.adorama.com/used', 'Adorama Used', 'Camera', true, 'manual', 'Camera and photo equipment'),
('https://www.bhphotovideo.com/used', 'B&H Used', 'Camera', true, 'manual', 'Professional photography equipment'),

-- Cycling sources
('https://www.pinkbike.com/buysell', 'Pinkbike', 'Cycling', true, 'manual', 'Mountain bike community marketplace'),
('https://www.bicyclebluebook.com', 'Bicycle Blue Book', 'Cycling', true, 'manual', 'Bicycle valuation and marketplace'),
('https://www.theproscloset.com', 'The Pro''s Closet', 'Cycling', true, 'manual', 'Premium used cycling gear'),

-- Automotive sources
('https://www.autotrader.com', 'AutoTrader', 'Automotive', true, 'manual', 'National auto marketplace'),
('https://www.cars.com', 'Cars.com', 'Automotive', true, 'manual', 'Vehicle listings and research'),
('https://www.cargurus.com', 'CarGurus', 'Automotive', true, 'manual', 'Car shopping platform'),

-- Electronics sources
('https://www.swappa.com', 'Swappa', 'Electronics', true, 'manual', 'Used mobile devices'),
('https://www.gazelle.com', 'Gazelle', 'Electronics', true, 'manual', 'Consumer electronics buyback'),

-- Furniture sources
('https://www.chairish.com', 'Chairish', 'Furniture', true, 'manual', 'Vintage and designer furniture'),
('https://www.1stdibs.com', '1stDibs', 'Furniture', true, 'manual', 'Luxury vintage and antique furniture'),

-- Musical Instruments
('https://reverb.com', 'Reverb', 'Musical Instruments', true, 'manual', 'Musical instrument marketplace'),
('https://www.guitarcenter.com/Used', 'Guitar Center Used', 'Musical Instruments', true, 'manual', 'Used musical instruments');

-- Insert sample tertiary sources for Denver region
INSERT INTO tertiary_sources (url, name, category, region, is_active, discovered_by, notes) VALUES
-- Denver/Colorado specific sources
('https://denver.craigslist.org', 'Craigslist Denver', NULL, 'denver', true, 'manual', 'Primary Denver classifieds'),
('https://boulder.craigslist.org', 'Craigslist Boulder', NULL, 'denver', true, 'manual', 'Boulder area classifieds'),
('https://fortcollins.craigslist.org', 'Craigslist Fort Collins', NULL, 'denver', true, 'manual', 'Fort Collins classifieds'),
('https://coloradosprings.craigslist.org', 'Craigslist Colorado Springs', NULL, 'denver', true, 'manual', 'Colorado Springs classifieds'),

-- Local Denver forums and communities
('https://www.denverforum.com/marketplace', 'Denver Forum Marketplace', NULL, 'denver', true, 'crawler', 'Local Denver community marketplace'),
('https://www.milehighjeep.com/classifieds', 'Mile High Jeep Classifieds', 'Automotive', 'denver', true, 'crawler', 'Colorado Jeep community'),
('https://www.frontrangeriders.com/classifieds', 'Front Range Riders', 'Motorcycle', 'denver', true, 'crawler', 'Colorado motorcycle community'),

-- College/University boards
('https://www.colorado.edu/classifieds', 'CU Boulder Classifieds', NULL, 'denver', true, 'crawler', 'University of Colorado marketplace'),
('https://www.du.edu/classifieds', 'DU Classifieds', NULL, 'denver', true, 'crawler', 'University of Denver marketplace'),

-- Specialty Colorado sources
('https://www.5280.com/classifieds', '5280 Magazine Classifieds', NULL, 'denver', true, 'crawler', 'Denver lifestyle magazine classifieds'),
('https://www.westword.com/classifieds', 'Westword Classifieds', NULL, 'denver', true, 'crawler', 'Denver alternative weekly classifieds');

-- Set realistic success rates for established sources
UPDATE secondary_sources SET 
    success_rate = CASE 
        WHEN name LIKE '%KEH%' OR name LIKE '%B&H%' THEN 85.0
        WHEN name LIKE '%Reverb%' OR name LIKE '%Pinkbike%' THEN 78.0
        WHEN name LIKE '%AutoTrader%' OR name LIKE '%Cars.com%' THEN 72.0
        ELSE 65.0
    END,
    attempt_count = 10,
    success_count = CASE 
        WHEN name LIKE '%KEH%' OR name LIKE '%B&H%' THEN 8
        WHEN name LIKE '%Reverb%' OR name LIKE '%Pinkbike%' THEN 7
        WHEN name LIKE '%AutoTrader%' OR name LIKE '%Cars.com%' THEN 7
        ELSE 6
    END,
    last_attempt_at = NOW() - INTERVAL '2 hours',
    last_success_at = NOW() - INTERVAL '4 hours';

UPDATE tertiary_sources SET 
    reliability_score = CASE 
        WHEN name LIKE '%craigslist%' THEN 90.0
        WHEN name LIKE '%University%' OR name LIKE '%CU %' OR name LIKE '%DU %' THEN 75.0
        ELSE 60.0
    END,
    freshness_score = CASE 
        WHEN name LIKE '%craigslist%' THEN 95.0
        WHEN name LIKE '%Forum%' THEN 70.0
        ELSE 65.0
    END,
    attempt_count = 8,
    success_count = CASE 
        WHEN name LIKE '%craigslist%' THEN 7
        WHEN name LIKE '%University%' THEN 6
        ELSE 5
    END,
    last_attempt_at = NOW() - INTERVAL '3 hours',
    last_success_at = NOW() - INTERVAL '6 hours';