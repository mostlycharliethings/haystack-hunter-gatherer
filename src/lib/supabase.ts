import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      search_configs: {
        Row: {
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
        Insert: {
          id?: string;
          brand: string;
          model: string;
          qualifier?: string | null;
          sub_qualifier?: string | null;
          year_start?: number | null;
          year_end?: number | null;
          price_threshold: number;
          price_multiplier: number;
          location: string;
          email: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand?: string;
          model?: string;
          qualifier?: string | null;
          sub_qualifier?: string | null;
          year_start?: number | null;
          year_end?: number | null;
          price_threshold?: number;
          price_multiplier?: number;
          location?: string;
          email?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      listings: {
        Row: {
          id: string;
          title: string;
          price: number;
          location: string;
          distance: number | null;
          source: string;
          tier: number;
          url: string;
          image_url: string | null;
          posted_at: string;
          discovered_at: string;
          search_config_id: string;
        };
        Insert: {
          id?: string;
          title: string;
          price: number;
          location: string;
          distance?: number | null;
          source: string;
          tier: number;
          url: string;
          image_url?: string | null;
          posted_at: string;
          discovered_at?: string;
          search_config_id: string;
        };
        Update: {
          id?: string;
          title?: string;
          price?: number;
          location?: string;
          distance?: number | null;
          source?: string;
          tier?: number;
          url?: string;
          image_url?: string | null;
          posted_at?: string;
          discovered_at?: string;
          search_config_id?: string;
        };
      };
    };
  };
};