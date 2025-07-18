import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

type Listing = Tables<'listings'> & {
  searchConfigName?: string;
};

export function useListings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchListings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('listings')
        .select(`
          *,
          search_configs!inner(brand, model, qualifier, sub_qualifier)
        `)
        .order('discovered_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Transform data to include searchConfigName
      const transformedListings = (data || []).map(listing => ({
        ...listing,
        searchConfigName: [
          listing.search_configs.brand,
          listing.search_configs.model,
          listing.search_configs.qualifier,
          listing.search_configs.sub_qualifier
        ]
          .filter(Boolean)
          .join(' '),
      }));

      setListings(transformedListings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch listings');
      toast({
        title: "Error",
        description: "Failed to load listings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  return {
    listings,
    loading,
    error,
    refetch: fetchListings,
  };
}