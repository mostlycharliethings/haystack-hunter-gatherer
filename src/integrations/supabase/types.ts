export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      craigslist_areas: {
        Row: {
          abbreviation: string
          area_id: string
          country: string
          created_at: string
          description: string
          hostname: string
          id: number
          latitude: number
          longitude: number
          region: string | null
          short_description: string | null
          updated_at: string
        }
        Insert: {
          abbreviation: string
          area_id: string
          country: string
          created_at?: string
          description: string
          hostname: string
          id?: number
          latitude: number
          longitude: number
          region?: string | null
          short_description?: string | null
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          area_id?: string
          country?: string
          created_at?: string
          description?: string
          hostname?: string
          id?: number
          latitude?: number
          longitude?: number
          region?: string | null
          short_description?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      craigslist_sub_areas: {
        Row: {
          abbreviation: string
          created_at: string
          description: string
          id: number
          parent_area_id: string
        }
        Insert: {
          abbreviation: string
          created_at?: string
          description: string
          id?: number
          parent_area_id: string
        }
        Update: {
          abbreviation?: string
          created_at?: string
          description?: string
          id?: number
          parent_area_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "craigslist_sub_areas_parent_area_id_fkey"
            columns: ["parent_area_id"]
            isOneToOne: false
            referencedRelation: "craigslist_areas"
            referencedColumns: ["area_id"]
          },
        ]
      }
      listings: {
        Row: {
          discovered_at: string
          distance: number | null
          id: string
          image_url: string | null
          latitude: number | null
          location: string
          longitude: number | null
          posted_at: string
          price: number
          search_config_id: string
          source: string
          tier: number
          title: string
          url: string
        }
        Insert: {
          discovered_at?: string
          distance?: number | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          location: string
          longitude?: number | null
          posted_at: string
          price: number
          search_config_id: string
          source: string
          tier?: number
          title: string
          url: string
        }
        Update: {
          discovered_at?: string
          distance?: number | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          location?: string
          longitude?: number | null
          posted_at?: string
          price?: number
          search_config_id?: string
          source?: string
          tier?: number
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_search_config_id_fkey"
            columns: ["search_config_id"]
            isOneToOne: false
            referencedRelation: "search_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_activity: {
        Row: {
          created_at: string
          execution_time_ms: number | null
          id: string
          listings_found: number | null
          message: string | null
          metadata: Json | null
          module_name: string
          search_config_id: string | null
          sources_processed: number | null
          status: string
        }
        Insert: {
          created_at?: string
          execution_time_ms?: number | null
          id?: string
          listings_found?: number | null
          message?: string | null
          metadata?: Json | null
          module_name: string
          search_config_id?: string | null
          sources_processed?: number | null
          status: string
        }
        Update: {
          created_at?: string
          execution_time_ms?: number | null
          id?: string
          listings_found?: number | null
          message?: string | null
          metadata?: Json | null
          module_name?: string
          search_config_id?: string | null
          sources_processed?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_activity_search_config_id_fkey"
            columns: ["search_config_id"]
            isOneToOne: false
            referencedRelation: "search_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      search_configs: {
        Row: {
          brand: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          location: string
          model: string
          price_multiplier: number
          price_threshold: number
          qualifier: string | null
          sub_qualifier: string | null
          updated_at: string
          year_end: number | null
          year_start: number | null
        }
        Insert: {
          brand: string
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          location: string
          model: string
          price_multiplier?: number
          price_threshold: number
          qualifier?: string | null
          sub_qualifier?: string | null
          updated_at?: string
          year_end?: number | null
          year_start?: number | null
        }
        Update: {
          brand?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          location?: string
          model?: string
          price_multiplier?: number
          price_threshold?: number
          qualifier?: string | null
          sub_qualifier?: string | null
          updated_at?: string
          year_end?: number | null
          year_start?: number | null
        }
        Relationships: []
      }
      secondary_sources: {
        Row: {
          context_type: string | null
          discovered_at: string
          distance: number | null
          id: string
          image_url: string | null
          location: string
          posted_at: string
          price: number
          relevance_score: number | null
          search_config_id: string
          searchable: boolean | null
          searchable_false_reason: string | null
          source: string
          tier: number
          title: string
          updated_at: string | null
          url: string
          validation_passed: boolean | null
        }
        Insert: {
          context_type?: string | null
          discovered_at?: string
          distance?: number | null
          id?: string
          image_url?: string | null
          location: string
          posted_at: string
          price: number
          relevance_score?: number | null
          search_config_id: string
          searchable?: boolean | null
          searchable_false_reason?: string | null
          source: string
          tier?: number
          title: string
          updated_at?: string | null
          url: string
          validation_passed?: boolean | null
        }
        Update: {
          context_type?: string | null
          discovered_at?: string
          distance?: number | null
          id?: string
          image_url?: string | null
          location?: string
          posted_at?: string
          price?: number
          relevance_score?: number | null
          search_config_id?: string
          searchable?: boolean | null
          searchable_false_reason?: string | null
          source?: string
          tier?: number
          title?: string
          updated_at?: string | null
          url?: string
          validation_passed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "secondary_sources_search_config_id_fkey"
            columns: ["search_config_id"]
            isOneToOne: false
            referencedRelation: "search_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      tertiary_sources: {
        Row: {
          discovered_at: string
          discovery_type: string | null
          distance: number | null
          id: string
          image_url: string | null
          location: string
          posted_at: string
          price: number
          relevance_score: number | null
          search_config_id: string
          searchable: boolean | null
          searchable_false_reason: string | null
          source: string
          tier: number
          title: string
          updated_at: string | null
          url: string
        }
        Insert: {
          discovered_at?: string
          discovery_type?: string | null
          distance?: number | null
          id?: string
          image_url?: string | null
          location: string
          posted_at: string
          price: number
          relevance_score?: number | null
          search_config_id: string
          searchable?: boolean | null
          searchable_false_reason?: string | null
          source: string
          tier?: number
          title: string
          updated_at?: string | null
          url: string
        }
        Update: {
          discovered_at?: string
          discovery_type?: string | null
          distance?: number | null
          id?: string
          image_url?: string | null
          location?: string
          posted_at?: string
          price?: number
          relevance_score?: number | null
          search_config_id?: string
          searchable?: boolean | null
          searchable_false_reason?: string | null
          source?: string
          tier?: number
          title?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tertiary_sources_search_config_id_fkey"
            columns: ["search_config_id"]
            isOneToOne: false
            referencedRelation: "search_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      widenet_results: {
        Row: {
          discovered_at: string
          id: string
          is_visited: boolean | null
          notes: string | null
          position: number
          search_config_id: string
          search_query: string
          snippet: string | null
          title: string
          url: string
        }
        Insert: {
          discovered_at?: string
          id?: string
          is_visited?: boolean | null
          notes?: string | null
          position: number
          search_config_id: string
          search_query: string
          snippet?: string | null
          title: string
          url: string
        }
        Update: {
          discovered_at?: string
          id?: string
          is_visited?: boolean | null
          notes?: string | null
          position?: number
          search_config_id?: string
          search_query?: string
          snippet?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bytea_to_text: {
        Args: { data: string }
        Returns: string
      }
      get_nearby_craigslist_areas: {
        Args: { user_lat: number; user_lon: number; radius_miles?: number }
        Returns: {
          area_id: string
          hostname: string
          description: string
          distance_miles: number
        }[]
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_delete: {
        Args:
          | { uri: string }
          | { uri: string; content: string; content_type: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_get: {
        Args: { uri: string } | { uri: string; data: Json }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
      }
      http_list_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { uri: string; content: string; content_type: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_post: {
        Args:
          | { uri: string; content: string; content_type: string }
          | { uri: string; data: Json }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_put: {
        Args: { uri: string; content: string; content_type: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_reset_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      log_scrape_activity: {
        Args: {
          p_module_name: string
          p_search_config_id?: string
          p_status?: string
          p_message?: string
          p_listings_found?: number
          p_sources_processed?: number
          p_execution_time_ms?: number
          p_metadata?: Json
        }
        Returns: string
      }
      text_to_bytea: {
        Args: { data: string }
        Returns: string
      }
      update_search_config_last_run: {
        Args: { p_config_id: string }
        Returns: undefined
      }
      urlencode: {
        Args: { data: Json } | { string: string } | { string: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown | null
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
