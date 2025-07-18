import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type SearchConfig = {
  id: string;
  brand: string;
  model: string;
  qualifier: string | null;
  sub_qualifier: string | null;
  year_start: number | null;
  year_end: number | null;
  price_threshold: number;
  price_multiplier: number;
  location: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type InsertSearchConfig = Omit<SearchConfig, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
};

type UpdateSearchConfig = Partial<SearchConfig>;

export function useSearchConfigs() {
  const [configs, setConfigs] = useState<SearchConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('search_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConfigs(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch configurations');
      toast({
        title: "Error",
        description: "Failed to load search configurations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createConfig = async (configData: InsertSearchConfig) => {
    try {
      const { data, error } = await supabase
        .from('search_configs')
        .insert(configData)
        .select()
        .single();

      if (error) throw error;

      setConfigs(prev => [data, ...prev]);
      
      // Trigger notifier for new config
      try {
        await supabase.functions.invoke('notifier', {
          body: { 
            type: 'search_config_saved',
            searchConfig: data
          }
        });
      } catch (notifierError) {
        console.warn('Failed to send notification:', notifierError);
      }

      toast({
        title: "Configuration Created",
        description: "New search configuration has been created successfully.",
      });

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create configuration';
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateConfig = async (id: string, updates: UpdateSearchConfig) => {
    try {
      const { data, error } = await supabase
        .from('search_configs')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setConfigs(prev => prev.map(config => 
        config.id === id ? data : config
      ));

      toast({
        title: "Configuration Updated",
        description: "Search configuration has been updated successfully.",
      });

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update configuration';
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteConfig = async (id: string) => {
    try {
      const { error } = await supabase
        .from('search_configs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setConfigs(prev => prev.filter(config => config.id !== id));

      toast({
        title: "Configuration Deleted",
        description: "Search configuration has been deleted.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete configuration';
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await updateConfig(id, { is_active: isActive });
      
      toast({
        title: isActive ? "Search Resumed" : "Search Paused",
        description: `Search configuration has been ${isActive ? "resumed" : "paused"}.`,
      });
    } catch (err) {
      // Error is already handled in updateConfig
      throw err;
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  return {
    configs,
    loading,
    error,
    createConfig,
    updateConfig,
    deleteConfig,
    toggleActive,
    refetch: fetchConfigs,
  };
}