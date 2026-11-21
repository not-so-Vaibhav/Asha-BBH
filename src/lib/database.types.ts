// Generated-format TypeScript definitions matching supabase/migrations/*.sql.
// Regenerate after any migration change with:
//   npx supabase gen types typescript --local > src/lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      areas: {
        Row: {
          id: string;
          code: string;
          name: string;
          district: string;
          block: string;
          synthetic: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          district: string;
          block: string;
          synthetic?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          district?: string;
          block?: string;
          synthetic?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      villages: {
        Row: {
          id: string;
          code: string;
          area_id: string;
          name: string;
          block: string;
          district: string;
          center_lat: number;
          center_lng: number;
          boundary_json: Json;
          synthetic: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          area_id: string;
          name: string;
          block: string;
          district: string;
          center_lat: number;
          center_lng: number;
          boundary_json?: Json;
          synthetic?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          area_id?: string;
          name?: string;
          block?: string;
          district?: string;
          center_lat?: number;
          center_lng?: number;
          boundary_json?: Json;
          synthetic?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      health_facilities: {
        Row: {
          id: string;
          code: string;
          area_id: string;
          name: string;
          sample_label: string;
          lat: number;
          lng: number;
          distance_label: string;
          synthetic: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          area_id: string;
          name: string;
          sample_label?: string;
          lat: number;
          lng: number;
          distance_label?: string;
          synthetic?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          area_id?: string;
          name?: string;
          sample_label?: string;
          lat?: number;
          lng?: number;
          distance_label?: string;
          synthetic?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      danger_sign_rules: {
        Row: {
          id: string;
          version: string;
          category: string;
          applies_to: Database['public']['Enums']['beneficiary_kind'][];
          source_citation: string;
          wording_en: string;
          wording_hi: string;
          wording_mr: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          version: string;
          category: string;
          applies_to: Database['public']['Enums']['beneficiary_kind'][];
          source_citation: string;
          wording_en: string;
          wording_hi: string;
          wording_mr: string;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          version?: string;
          category?: string;
          applies_to?: Database['public']['Enums']['beneficiary_kind'][];
          source_citation?: string;
          wording_en?: string;
          wording_hi?: string;
          wording_mr?: string;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      workers: {
        Row: {
          id: string;
          display_name: string;
          asha_id_demo: string;
          area_id: string;
          language: 'en' | 'hi' | 'mr';
          role: Database['public']['Enums']['worker_role'];
          is_demo: boolean;
          consent_accepted_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          asha_id_demo?: string;
          area_id: string;
          language?: 'en' | 'hi' | 'mr';
          role?: Database['public']['Enums']['worker_role'];
          is_demo?: boolean;
          consent_accepted_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          asha_id_demo?: string;
          area_id?: string;
          language?: 'en' | 'hi' | 'mr';
          role?: Database['public']['Enums']['worker_role'];
          is_demo?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      households: {
        Row: {
          id: string;
          code: string;
          area_id: string;
          village_id: string;
          worker_id: string | null;
          label: string;
          lat: number;
          lng: number;
          synthetic: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          area_id: string;
          village_id: string;
          worker_id?: string | null;
          label: string;
          lat: number;
          lng: number;
          synthetic?: boolean;
          created_at?: string;
        };
        Update: {
          label?: string;
          lat?: number;
          lng?: number;
        };
        Relationships: [];
      };
      beneficiaries: {
        Row: {
          id: string;
          code: string;
          area_id: string;
          village_id: string;
          household_id: string | null;
          worker_id: string | null;
          name: string;
          kind: Database['public']['Enums']['beneficiary_kind'];
          age_label: string;
          due_label: string;
          synthetic: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          area_id: string;
          village_id: string;
          household_id?: string | null;
          worker_id?: string | null;
          name: string;
          kind: Database['public']['Enums']['beneficiary_kind'];
          age_label: string;
          due_label: string;
          synthetic?: boolean;
          created_at?: string;
        };
        Update: {
          due_label?: string;
        };
        Relationships: [];
      };
      visits: {
        Row: {
          id: string;
          beneficiary_id: string;
          worker_id: string;
          area_id: string;
          idempotency_key: string;
          status: Database['public']['Enums']['visit_status'];
          visit_type: Database['public']['Enums']['visit_type'];
          flagged_danger: boolean;
          needs_review: boolean;
          duplicate_override_reason: string | null;
          confirmed_at: string | null;
          synthetic: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          beneficiary_id: string;
          worker_id: string;
          area_id: string;
          idempotency_key: string;
          status?: Database['public']['Enums']['visit_status'];
          visit_type?: Database['public']['Enums']['visit_type'];
          flagged_danger?: boolean;
          needs_review?: boolean;
          duplicate_override_reason?: string | null;
          confirmed_at?: string | null;
          synthetic?: boolean;
        };
        Update: {
          status?: Database['public']['Enums']['visit_status'];
          visit_type?: Database['public']['Enums']['visit_type'];
          flagged_danger?: boolean;
          needs_review?: boolean;
          duplicate_override_reason?: string | null;
          confirmed_at?: string | null;
        };
        Relationships: [];
      };
      visit_fields: {
        Row: {
          id: string;
          visit_id: string;
          field_name: 'beneficiaryId' | 'visitType' | 'weight' | 'vaccinationsDue' | 'nextVisitDate';
          field_value: string;
          source: Database['public']['Enums']['field_source'];
          confidence: number | null;
          synthetic: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          visit_id: string;
          field_name: 'beneficiaryId' | 'visitType' | 'weight' | 'vaccinationsDue' | 'nextVisitDate';
          field_value: string;
          source?: Database['public']['Enums']['field_source'];
          confidence?: number | null;
          synthetic?: boolean;
        };
        Update: {
          field_value?: string;
          source?: Database['public']['Enums']['field_source'];
          confidence?: number | null;
        };
        Relationships: [];
      };
      visit_field_history: {
        Row: {
          id: string;
          visit_id: string;
          field_name: 'beneficiaryId' | 'visitType' | 'weight' | 'vaccinationsDue' | 'nextVisitDate';
          old_value: string;
          new_value: string;
          changed_at: string;
          changed_via: Database['public']['Enums']['change_via'];
          changed_by: string | null;
          synthetic: boolean;
        };
        Insert: {
          id?: string;
          visit_id: string;
          field_name: 'beneficiaryId' | 'visitType' | 'weight' | 'vaccinationsDue' | 'nextVisitDate';
          old_value: string;
          new_value: string;
          changed_at?: string;
          changed_via?: Database['public']['Enums']['change_via'];
          changed_by?: string | null;
          synthetic?: boolean;
        };
        Update: never;
        Relationships: [];
      };
      followups: {
        Row: {
          id: string;
          beneficiary_id: string;
          visit_id: string | null;
          worker_id: string;
          area_id: string;
          due_date: string;
          status: Database['public']['Enums']['followup_status'];
          synthetic: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          beneficiary_id: string;
          visit_id?: string | null;
          worker_id: string;
          area_id: string;
          due_date: string;
          status?: Database['public']['Enums']['followup_status'];
          synthetic?: boolean;
        };
        Update: {
          status?: Database['public']['Enums']['followup_status'];
          due_date?: string;
        };
        Relationships: [];
      };
      referrals: {
        Row: {
          id: string;
          beneficiary_id: string;
          visit_id: string | null;
          worker_id: string;
          area_id: string;
          rule_id: string;
          rule_version: string;
          facility_id: string | null;
          facility_name: string;
          needs_review: boolean;
          status: Database['public']['Enums']['referral_status'];
          source: 'asr' | 'manual';
          transcript_excerpt: string;
          synthetic: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          beneficiary_id: string;
          visit_id?: string | null;
          worker_id: string;
          area_id: string;
          rule_id: string;
          rule_version: string;
          facility_id?: string | null;
          facility_name: string;
          needs_review?: boolean;
          status?: Database['public']['Enums']['referral_status'];
          source?: 'asr' | 'manual';
          transcript_excerpt: string;
          synthetic?: boolean;
        };
        Update: {
          visit_id?: string | null;
          status?: Database['public']['Enums']['referral_status'];
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: number;
          actor_id: string | null;
          table_name: string;
          row_id: string;
          action: 'INSERT' | 'UPDATE' | 'DELETE';
          before_data: Json | null;
          after_data: Json | null;
          request_id: string | null;
          occurred_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      confirm_visit: {
        Args: {
          p_beneficiary_id: string;
          p_idempotency_key: string;
          p_visit_type: Database['public']['Enums']['visit_type'];
          p_confirmed: boolean;
          p_fields: Json;
          p_history?: Json;
          p_flagged_danger?: boolean;
          p_needs_review?: boolean;
          p_duplicate_override_reason?: string | null;
          p_referral_id?: string | null;
        };
        Returns: Json;
      };
      create_referral: {
        Args: {
          p_beneficiary_id: string;
          p_rule_id: string;
          p_needs_review?: boolean;
          p_source?: 'asr' | 'manual';
          p_excerpt?: string;
          p_visit_id?: string | null;
        };
        Returns: Database['public']['Tables']['referrals']['Row'];
      };
      seed_demo_workspace: {
        Args: {
          p_display_name?: string;
          p_language?: 'en' | 'hi' | 'mr';
          p_area_id?: string | null;
        };
        Returns: Json;
      };
      supervisor_area_summary: {
        Args: Record<string, never>;
        Returns: Json;
      };
      dashboard_csv_summary: {
        Args: Record<string, never>;
        Returns: Json;
      };
      delete_my_account: {
        Args: Record<string, never>;
        Returns: Json;
      };
    };
    Enums: {
      worker_role: 'worker' | 'supervisor';
      beneficiary_kind: 'pregnant' | 'newborn' | 'child';
      visit_status: 'draft' | 'saved';
      visit_type: 'ANC' | 'PNC' | 'HBNC' | 'HBYC' | 'Immunisation' | 'General';
      field_source: 'reported' | 'observed' | 'measured' | 'verified';
      change_via: 'voice' | 'typed';
      followup_status: 'upcoming' | 'pending' | 'overdue' | 'done';
      referral_status: 'pending' | 'reviewed' | 'closed';
    };
    CompositeTypes: Record<string, never>;
  };
};
