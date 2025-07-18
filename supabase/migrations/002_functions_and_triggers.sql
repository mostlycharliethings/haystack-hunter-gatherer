-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for search_configs updated_at
CREATE TRIGGER update_search_configs_updated_at
    BEFORE UPDATE ON search_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate distance using Haversine formula
CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 DECIMAL, 
    lon1 DECIMAL, 
    lat2 DECIMAL, 
    lon2 DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
    earth_radius DECIMAL := 3959.0; -- Earth's radius in miles
    dlat DECIMAL;
    dlon DECIMAL;
    a DECIMAL;
    c DECIMAL;
BEGIN
    -- Convert degrees to radians
    dlat := RADIANS(lat2 - lat1);
    dlon := RADIANS(lon2 - lon1);
    
    -- Haversine formula
    a := SIN(dlat/2) * SIN(dlat/2) + COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * SIN(dlon/2) * SIN(dlon/2);
    c := 2 * ATAN2(SQRT(a), SQRT(1-a));
    
    RETURN earth_radius * c;
END;
$$ LANGUAGE plpgsql;

-- Function to update source success rates
CREATE OR REPLACE FUNCTION update_source_success_rate()
RETURNS TRIGGER AS $$
BEGIN
    -- Update success rate based on attempt_count and success_count
    IF NEW.attempt_count > 0 THEN
        NEW.success_rate := (NEW.success_count::DECIMAL / NEW.attempt_count::DECIMAL) * 100;
    ELSE
        NEW.success_rate := 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for source success rate updates
CREATE TRIGGER update_secondary_sources_success_rate
    BEFORE UPDATE ON secondary_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_source_success_rate();

CREATE TRIGGER update_tertiary_sources_success_rate
    BEFORE UPDATE ON tertiary_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_source_success_rate();

-- Function to get active search configs for cron jobs
CREATE OR REPLACE FUNCTION get_active_search_configs()
RETURNS TABLE(
    config_id UUID,
    brand TEXT,
    model TEXT,
    qualifier TEXT,
    sub_qualifier TEXT,
    year_start INTEGER,
    year_end INTEGER,
    price_threshold INTEGER,
    price_multiplier DECIMAL,
    location TEXT,
    user_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sc.id,
        sc.brand,
        sc.model,
        sc.qualifier,
        sc.sub_qualifier,
        sc.year_start,
        sc.year_end,
        sc.price_threshold,
        sc.price_multiplier,
        sc.location,
        sc.user_id
    FROM search_configs sc
    WHERE sc.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get sources by category and tier
CREATE OR REPLACE FUNCTION get_sources_by_category(
    category_filter TEXT DEFAULT NULL,
    tier_filter INTEGER DEFAULT NULL
)
RETURNS TABLE(
    source_id UUID,
    url TEXT,
    name TEXT,
    category TEXT,
    tier INTEGER,
    success_rate DECIMAL,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ss.id,
        ss.url,
        ss.name,
        ss.category,
        2 as tier,
        ss.success_rate,
        ss.is_active
    FROM secondary_sources ss
    WHERE (category_filter IS NULL OR ss.category = category_filter)
      AND ss.is_active = true
    
    UNION ALL
    
    SELECT 
        ts.id,
        ts.url,
        ts.name,
        ts.category,
        3 as tier,
        ts.reliability_score as success_rate,
        ts.is_active
    FROM tertiary_sources ts
    WHERE (category_filter IS NULL OR ts.category = category_filter)
      AND ts.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log scrape activity
CREATE OR REPLACE FUNCTION log_scrape_activity(
    p_module_name TEXT,
    p_search_config_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'started',
    p_message TEXT DEFAULT NULL,
    p_listings_found INTEGER DEFAULT 0,
    p_sources_processed INTEGER DEFAULT 0,
    p_execution_time_ms INTEGER DEFAULT NULL,
    p_error_details JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO scrape_activity_log (
        module_name,
        search_config_id,
        status,
        message,
        listings_found,
        sources_processed,
        execution_time_ms,
        completed_at,
        error_details,
        metadata
    ) VALUES (
        p_module_name,
        p_search_config_id,
        p_status,
        p_message,
        p_listings_found,
        p_sources_processed,
        p_execution_time_ms,
        CASE WHEN p_status IN ('success', 'partial_success', 'failure') 
             THEN TIMEZONE('utc'::text, NOW()) 
             ELSE NULL END,
        p_error_details,
        p_metadata
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update search config last run time
CREATE OR REPLACE FUNCTION update_search_config_last_run(
    p_config_id UUID
)
RETURNS VOID AS $$
BEGIN
    UPDATE search_configs 
    SET last_run_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get listing stats for a search config
CREATE OR REPLACE FUNCTION get_search_config_stats(
    p_config_id UUID
)
RETURNS TABLE(
    total_listings INTEGER,
    tier1_count INTEGER,
    tier2_count INTEGER,
    tier3_count INTEGER,
    avg_price DECIMAL,
    min_price INTEGER,
    max_price INTEGER,
    latest_listing TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_listings,
        COUNT(CASE WHEN tier = 1 THEN 1 END)::INTEGER as tier1_count,
        COUNT(CASE WHEN tier = 2 THEN 1 END)::INTEGER as tier2_count,
        COUNT(CASE WHEN tier = 3 THEN 1 END)::INTEGER as tier3_count,
        AVG(price)::DECIMAL as avg_price,
        MIN(price)::INTEGER as min_price,
        MAX(price)::INTEGER as max_price,
        MAX(posted_at) as latest_listing
    FROM listings 
    WHERE search_config_id = p_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;