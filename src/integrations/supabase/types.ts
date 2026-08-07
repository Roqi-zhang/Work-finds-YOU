export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_call_logs: {
        Row: {
          completion_tokens: number | null
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          model: string | null
          prompt_tokens: number | null
          provider: string | null
          status: string
          task: string
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          status?: string
          task: string
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          status?: string
          task?: string
          user_id?: string | null
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_key: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_key: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_key?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          title?: string
        }
        Relationships: []
      }
      application_events: {
        Row: {
          application_id: string
          created_at: string
          event_type: string
          from_status: Database["public"]["Enums"]["application_status"] | null
          id: string
          occurred_at: string
          payload: Json
          to_status: Database["public"]["Enums"]["application_status"] | null
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          event_type: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          occurred_at?: string
          payload?: Json
          to_status?: Database["public"]["Enums"]["application_status"] | null
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          occurred_at?: string
          payload?: Json
          to_status?: Database["public"]["Enums"]["application_status"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string | null
          created_at: string
          id: string
          job_profile_id: string
          note: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          id?: string
          job_profile_id: string
          note?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          id?: string
          job_profile_id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_profile_id_fkey"
            columns: ["job_profile_id"]
            isOneToOne: false
            referencedRelation: "job_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compare_pool: {
        Row: {
          created_at: string
          id: string
          job_profile_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_profile_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_profile_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compare_pool_job_profile_id_fkey"
            columns: ["job_profile_id"]
            isOneToOne: false
            referencedRelation: "job_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_profiles: {
        Row: {
          company: string | null
          content_hash: string | null
          created_at: string
          dimensions: Json
          error: string | null
          evaluation_rubric: Json | null
          evidence_items: Json | null
          file_name: string | null
          file_path: string | null
          id: string
          ideal_profile: Json | null
          location: string | null
          prompt_version: string | null
          requirement_records: Json | null
          requirement_signals: Json | null
          requirements: Json
          rubric_hash: string | null
          rubric_version: string | null
          schema_version: string
          slug: string
          source_text: string | null
          status: Database["public"]["Enums"]["analysis_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          content_hash?: string | null
          created_at?: string
          dimensions?: Json
          error?: string | null
          evaluation_rubric?: Json | null
          evidence_items?: Json | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          ideal_profile?: Json | null
          location?: string | null
          prompt_version?: string | null
          requirement_records?: Json | null
          requirement_signals?: Json | null
          requirements?: Json
          rubric_hash?: string | null
          rubric_version?: string | null
          schema_version?: string
          slug: string
          source_text?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          content_hash?: string | null
          created_at?: string
          dimensions?: Json
          error?: string | null
          evaluation_rubric?: Json | null
          evidence_items?: Json | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          ideal_profile?: Json | null
          location?: string | null
          prompt_version?: string | null
          requirement_records?: Json | null
          requirement_signals?: Json | null
          requirements?: Json
          rubric_hash?: string | null
          rubric_version?: string | null
          schema_version?: string
          slug?: string
          source_text?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      match_reports: {
        Row: {
          created_at: string
          decision: Json
          decision_factors: Json | null
          dimension_matches: Json | null
          dimension_scores: Json
          error: string | null
          evidence_links: Json | null
          id: string
          job_profile_id: string
          judgements: Json
          rationale_summary: string | null
          reasoning_trace: string | null
          schema_version: string
          score: number | null
          scoring_version: string | null
          sources: Json
          stale: boolean
          status: Database["public"]["Enums"]["analysis_status"]
          steps: Json
          updated_at: string
          user_id: string
          user_profile_id: string
        }
        Insert: {
          created_at?: string
          decision?: Json
          decision_factors?: Json | null
          dimension_matches?: Json | null
          dimension_scores?: Json
          error?: string | null
          evidence_links?: Json | null
          id?: string
          job_profile_id: string
          judgements?: Json
          rationale_summary?: string | null
          reasoning_trace?: string | null
          schema_version?: string
          score?: number | null
          scoring_version?: string | null
          sources?: Json
          stale?: boolean
          status?: Database["public"]["Enums"]["analysis_status"]
          steps?: Json
          updated_at?: string
          user_id: string
          user_profile_id: string
        }
        Update: {
          created_at?: string
          decision?: Json
          decision_factors?: Json | null
          dimension_matches?: Json | null
          dimension_scores?: Json
          error?: string | null
          evidence_links?: Json | null
          id?: string
          job_profile_id?: string
          judgements?: Json
          rationale_summary?: string | null
          reasoning_trace?: string | null
          schema_version?: string
          score?: number | null
          scoring_version?: string | null
          sources?: Json
          stale?: boolean
          status?: Database["public"]["Enums"]["analysis_status"]
          steps?: Json
          updated_at?: string
          user_id?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_reports_job_profile_id_fkey"
            columns: ["job_profile_id"]
            isOneToOne: false
            referencedRelation: "job_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      resumes: {
        Row: {
          created_at: string
          error: string | null
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          status: Database["public"]["Enums"]["analysis_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["analysis_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["analysis_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          created_at: string
          id: string
          jd_parses: number
          match_runs: number
          period: string
          profile_builds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          jd_parses?: number
          match_runs?: number
          period: string
          profile_builds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          jd_parses?: number
          match_runs?: number
          period?: string
          profile_builds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          capability_signals: Json | null
          created_at: string
          dimensions: Json
          error: string | null
          evidence: Json
          evidence_items: Json | null
          experience_records: Json | null
          extraction_fingerprint: string | null
          id: string
          is_current: boolean
          profiling_fingerprint: string | null
          prompt_version: string | null
          resume_id: string | null
          rubric_hash: string | null
          rubric_version: string | null
          schema_version: string
          scoring_version: string | null
          sections: Json
          status: Database["public"]["Enums"]["analysis_status"]
          target_job_profile_id: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          capability_signals?: Json | null
          created_at?: string
          dimensions?: Json
          error?: string | null
          evidence?: Json
          evidence_items?: Json | null
          experience_records?: Json | null
          extraction_fingerprint?: string | null
          id?: string
          is_current?: boolean
          profiling_fingerprint?: string | null
          prompt_version?: string | null
          resume_id?: string | null
          rubric_hash?: string | null
          rubric_version?: string | null
          schema_version?: string
          scoring_version?: string | null
          sections?: Json
          status?: Database["public"]["Enums"]["analysis_status"]
          target_job_profile_id?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          capability_signals?: Json | null
          created_at?: string
          dimensions?: Json
          error?: string | null
          evidence?: Json
          evidence_items?: Json | null
          experience_records?: Json | null
          extraction_fingerprint?: string | null
          id?: string
          is_current?: boolean
          profiling_fingerprint?: string | null
          prompt_version?: string | null
          resume_id?: string | null
          rubric_hash?: string | null
          rubric_version?: string | null
          schema_version?: string
          scoring_version?: string | null
          sections?: Json
          status?: Database["public"]["Enums"]["analysis_status"]
          target_job_profile_id?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_target_job_profile_id_fkey"
            columns: ["target_job_profile_id"]
            isOneToOne: false
            referencedRelation: "job_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      analysis_status: "pending" | "running" | "succeeded" | "failed"
      application_status: "todo" | "applied" | "interviewing" | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
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
    Enums: {
      analysis_status: ["pending", "running", "succeeded", "failed"],
      application_status: ["todo", "applied", "interviewing", "closed"],
    },
  },
} as const
