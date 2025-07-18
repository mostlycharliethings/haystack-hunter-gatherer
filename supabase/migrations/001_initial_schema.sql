-- Enable RLS (Row Level Security)
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-secret-jwt-token-with-at-least-32-characters-long';

-- Create search_configs table
CREATE TABLE search_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    qualifier TEXT,
    sub_qualifier TEXT,
    year_start INTEGER,
    year_end INTEGER,
    price_threshold INTEGER NOT NULL CHECK (price_threshold > 0),
    price_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.0 CHECK (price_multiplier >= 0.01 AND price_multiplier <= 5.0),
    location TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    last_run_at TIMESTAMP WITH TIME ZONE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create listings table
CREATE TABLE listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    search_config_id UUID REFERENCES search_configs(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    price INTEGER NOT NULL,
    location TEXT NOT NULL,
    distance DECIMAL(8,2), -- Distance in miles
    source TEXT NOT NULL, -- Domain or marketplace name
    tier INTEGER NOT NULL CHECK (tier IN (1, 2, 3)), -- 1=primary, 2=secondary, 3=discovery
    url TEXT NOT NULL UNIQUE,
    image_url TEXT,
    posted_at TIMESTAMP WITH TIME ZONE,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    proximity_bucket TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN distance < 100 THEN '< 100 miles'
            WHEN distance <= 500 THEN '101-500 miles'
            ELSE '500+ miles'
        END
    ) STORED
);

-- Create secondary_sources table (discovered by contextual-finder)
CREATE TABLE secondary_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- e.g., 'Motorcycle', 'Camera', 'Cycling'
    success_rate DECIMAL(5,2) DEFAULT 0.0, -- Percentage of successful scrapes
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    attempt_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    discovered_by TEXT DEFAULT 'gpt', -- 'gpt' or 'manual'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    notes TEXT
);

-- Create tertiary_sources table (discovered by discovery-crawler)
CREATE TABLE tertiary_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT, -- May be null for general discovery
    region TEXT DEFAULT 'denver', -- Geographic scope
    success_rate DECIMAL(5,2) DEFAULT 0.0,
    freshness_score DECIMAL(5,2) DEFAULT 0.0, -- How recent/active the content is
    reliability_score DECIMAL(5,2) DEFAULT 0.0, -- Overall quality metric
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    attempt_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    discovered_by TEXT DEFAULT 'crawler',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    notes TEXT
);

-- Create ignored_sources table (flagged by users)
CREATE TABLE ignored_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    url TEXT NOT NULL,
    name TEXT,
    reason TEXT, -- Why it was ignored (broken, irrelevant, etc.)
    ignored_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    moved_from_table TEXT, -- 'secondary_sources' or 'tertiary_sources'
    moved_from_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create scrape_activity_log table
CREATE TABLE scrape_activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_name TEXT NOT NULL, -- 'primary-search', 'contextual-finder', etc.
    search_config_id UUID REFERENCES search_configs(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'partial_success', 'failure', 'started')),
    message TEXT, -- Plain-language description of what happened
    listings_found INTEGER DEFAULT 0,
    sources_processed INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_details JSONB, -- Structured error information
    metadata JSONB -- Additional context (source URLs, search terms, etc.)
);

-- Create indexes for performance
CREATE INDEX idx_search_configs_user_active ON search_configs(user_id, is_active);
CREATE INDEX idx_search_configs_last_run ON search_configs(last_run_at) WHERE is_active = true;

CREATE INDEX idx_listings_search_config ON listings(search_config_id);
CREATE INDEX idx_listings_price ON listings(price);
CREATE INDEX idx_listings_distance ON listings(distance);
CREATE INDEX idx_listings_tier ON listings(tier);
CREATE INDEX idx_listings_posted_at ON listings(posted_at DESC);
CREATE INDEX idx_listings_url ON listings(url);

CREATE INDEX idx_secondary_sources_category ON secondary_sources(category);
CREATE INDEX idx_secondary_sources_active ON secondary_sources(is_active);
CREATE INDEX idx_secondary_sources_success_rate ON secondary_sources(success_rate DESC);

CREATE INDEX idx_tertiary_sources_region ON tertiary_sources(region);
CREATE INDEX idx_tertiary_sources_active ON tertiary_sources(is_active);
CREATE INDEX idx_tertiary_sources_reliability ON tertiary_sources(reliability_score DESC);

CREATE INDEX idx_scrape_log_module ON scrape_activity_log(module_name);
CREATE INDEX idx_scrape_log_status ON scrape_activity_log(status);
CREATE INDEX idx_scrape_log_started_at ON scrape_activity_log(started_at DESC);

-- Enable Row Level Security
ALTER TABLE search_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE secondary_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tertiary_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ignored_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for search_configs
CREATE POLICY "Users can view their own search configs" ON search_configs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search configs" ON search_configs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own search configs" ON search_configs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own search configs" ON search_configs
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for listings (users can see listings for their search configs)
CREATE POLICY "Users can view listings for their search configs" ON listings
    FOR SELECT USING (
        search_config_id IN (
            SELECT id FROM search_configs WHERE user_id = auth.uid()
        )
    );

-- Allow service role to insert/update listings (for scraping)
CREATE POLICY "Service role can manage listings" ON listings
    FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for sources tables (read-only for users, service role can manage)
CREATE POLICY "Users can view sources" ON secondary_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage secondary sources" ON secondary_sources FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view tertiary sources" ON tertiary_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage tertiary sources" ON tertiary_sources FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for ignored_sources
CREATE POLICY "Users can view their ignored sources" ON ignored_sources
    FOR SELECT USING (auth.uid() = ignored_by);

CREATE POLICY "Users can insert ignored sources" ON ignored_sources
    FOR INSERT WITH CHECK (auth.uid() = ignored_by);

-- RLS Policies for scrape_activity_log
CREATE POLICY "Users can view logs for their search configs" ON scrape_activity_log
    FOR SELECT USING (
        search_config_id IS NULL OR 
        search_config_id IN (
            SELECT id FROM search_configs WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage scrape logs" ON scrape_activity_log
    FOR ALL USING (auth.role() = 'service_role');