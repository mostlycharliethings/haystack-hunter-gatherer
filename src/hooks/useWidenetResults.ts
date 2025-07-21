import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WidenetResult {
  id: string;
  search_config_id: string;
  title: string;
  url: string;
  snippet?: string;
  position: number;
  search_query: string;
  discovered_at: string;
  is_visited: boolean;
  notes?: string;
}

export const useWidenetResults = (searchConfigId?: string) => {
  const [results, setResults] = useState<WidenetResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchResults();
  }, [searchConfigId]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('widenet_results')
        .select('*')
        .order('discovered_at', { ascending: false });

      if (searchConfigId) {
        query = query.eq('search_config_id', searchConfigId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      setResults(data || []);
    } catch (err) {
      console.error('Error fetching widenet results:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const markAsVisited = async (resultId: string) => {
    try {
      const { error } = await supabase
        .from('widenet_results')
        .update({ is_visited: true })
        .eq('id', resultId);

      if (error) throw error;

      setResults(prev => 
        prev.map(result => 
          result.id === resultId 
            ? { ...result, is_visited: true }
            : result
        )
      );
    } catch (err) {
      console.error('Error marking result as visited:', err);
    }
  };

  const addNote = async (resultId: string, note: string) => {
    try {
      const { error } = await supabase
        .from('widenet_results')
        .update({ notes: note })
        .eq('id', resultId);

      if (error) throw error;

      setResults(prev => 
        prev.map(result => 
          result.id === resultId 
            ? { ...result, notes: note }
            : result
        )
      );
    } catch (err) {
      console.error('Error adding note to result:', err);
    }
  };

  return {
    results,
    loading,
    error,
    refetch: fetchResults,
    markAsVisited,
    addNote
  };
};