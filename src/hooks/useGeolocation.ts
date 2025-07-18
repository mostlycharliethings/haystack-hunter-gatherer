import { useState, useEffect } from 'react';

interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
  loading: boolean;
  error?: string;
}

export const useGeolocation = () => {
  const [location, setLocation] = useState<LocationData>({
    latitude: 0,
    longitude: 0,
    loading: true,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation(prev => ({
        ...prev,
        loading: false,
        error: 'Geolocation not supported'
      }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Reverse geocoding to get city name
          const response = await fetch(
            `https://api.opencagedata.com/geocode/v1/json?q=${latitude}+${longitude}&key=YOUR_API_KEY`
          );
          
          if (response.ok) {
            const data = await response.json();
            const city = data.results[0]?.components?.city || 
                        data.results[0]?.components?.town || 
                        data.results[0]?.components?.village || 
                        'Unknown Location';
            
            setLocation({
              latitude,
              longitude,
              city,
              loading: false,
            });
          } else {
            // Fallback to coordinates only
            setLocation({
              latitude,
              longitude,
              city: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
              loading: false,
            });
          }
        } catch {
          // Fallback to coordinates only
          setLocation({
            latitude,
            longitude,
            city: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
            loading: false,
          });
        }
      },
      (error) => {
        setLocation(prev => ({
          ...prev,
          loading: false,
          error: error.message
        }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  return location;
};