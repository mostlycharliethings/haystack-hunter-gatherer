import { MapPin, Loader2 } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';

export const LocationDisplay = () => {
  const { city, loading, error } = useGeolocation();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Locating...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <MapPin className="h-4 w-4" />
        <span>Location unavailable</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <MapPin className="h-4 w-4" />
      <span>{city}</span>
    </div>
  );
};