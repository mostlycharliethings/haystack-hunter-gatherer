-- Create function to calculate distance between two points in miles
CREATE OR REPLACE FUNCTION public.calculate_distance(lat1 DECIMAL, lon1 DECIMAL, lat2 DECIMAL, lon2 DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
  -- Haversine formula to calculate distance in miles
  RETURN (
    3959 * acos(
      LEAST(1.0, cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2) - radians(lon1)) + sin(radians(lat1)) * sin(radians(lat2)))
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;