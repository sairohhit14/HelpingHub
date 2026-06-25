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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      issue_types: {
        Row: {
          category_id: string | null
          default_priority: Database["public"]["Enums"]["ticket_priority"]
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          category_id?: string | null
          default_priority?: Database["public"]["Enums"]["ticket_priority"]
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          category_id?: string | null
          default_priority?: Database["public"]["Enums"]["ticket_priority"]
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "issue_types_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          ticket_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          ticket_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          ticket_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          mobile: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          is_active?: boolean
          mobile?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          mobile?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      refund_requests: {
        Row: {
          account_holder: string | null
          account_number: string | null
          amount: number
          charge_amount: number | null
          charge_per_ticket: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          id: string
          ifsc_code: string | null
          num_tickets: number | null
          reason: string | null
          refund_amount: number | null
          refund_method: Database["public"]["Enums"]["refund_method"] | null
          requested_by: string
          status: Database["public"]["Enums"]["refund_status"]
          ticket_id: string
          ticket_price: number | null
          total_paid: number | null
          transaction_id: string | null
          upi_id: string | null
          verified: boolean
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          amount: number
          charge_amount?: number | null
          charge_per_ticket?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          ifsc_code?: string | null
          num_tickets?: number | null
          reason?: string | null
          refund_amount?: number | null
          refund_method?: Database["public"]["Enums"]["refund_method"] | null
          requested_by: string
          status?: Database["public"]["Enums"]["refund_status"]
          ticket_id: string
          ticket_price?: number | null
          total_paid?: number | null
          transaction_id?: string | null
          upi_id?: string | null
          verified?: boolean
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          amount?: number
          charge_amount?: number | null
          charge_per_ticket?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          ifsc_code?: string | null
          num_tickets?: number | null
          reason?: string | null
          refund_amount?: number | null
          refund_method?: Database["public"]["Enums"]["refund_method"] | null
          requested_by?: string
          status?: Database["public"]["Enums"]["refund_status"]
          ticket_id?: string
          ticket_price?: number | null
          total_paid?: number | null
          transaction_id?: string | null
          upi_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_assignments: {
        Row: {
          agent_id: string
          assigned_at: string
          assigned_by: string | null
          id: string
          reason: string | null
          ticket_id: string
          unassigned_at: string | null
        }
        Insert: {
          agent_id: string
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          reason?: string | null
          ticket_id: string
          unassigned_at?: string | null
        }
        Update: {
          agent_id?: string
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          reason?: string | null
          ticket_id?: string
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_assignments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          ticket_id: string
          uploader_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          ticket_id: string
          uploader_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          ticket_id?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_categories: {
        Row: {
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      ticket_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          from_value: string | null
          id: string
          ticket_id: string
          to_value: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          ticket_id: string
          to_value?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          ticket_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_agent_id: string | null
          assigned_at: string | null
          booking_reference: string | null
          category_id: string | null
          closed_at: string | null
          created_at: string
          customer_id: string
          description: string
          escalated_at: string | null
          escalated_reason: string | null
          escalation_level: number
          id: string
          issue_type_id: string | null
          pnr_number: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_number: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_agent_id?: string | null
          assigned_at?: string | null
          booking_reference?: string | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id: string
          description: string
          escalated_at?: string | null
          escalated_reason?: string | null
          escalation_level?: number
          id?: string
          issue_type_id?: string | null
          pnr_number?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_number: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_agent_id?: string | null
          assigned_at?: string | null
          booking_reference?: string | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string
          description?: string
          escalated_at?: string | null
          escalated_reason?: string | null
          escalation_level?: number
          id?: string
          issue_type_id?: string | null
          pnr_number?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          ticket_number?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_issue_type_id_fkey"
            columns: ["issue_type_id"]
            isOneToOne: false
            referencedRelation: "issue_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          agent_tier: Database["public"]["Enums"]["agent_tier"] | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          agent_tier?: Database["public"]["Enums"]["agent_tier"] | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          agent_tier?: Database["public"]["Enums"]["agent_tier"] | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_sla_escalations: { Args: never; Returns: number }
    }
    Enums: {
      agent_tier: "junior" | "experienced" | "senior"
      app_role: "customer" | "agent" | "admin"
      refund_method: "bank_account" | "upi" | "transaction"
      refund_status: "pending" | "approved" | "rejected"
      ticket_priority: "low" | "medium" | "high" | "critical"
      ticket_status:
        | "open"
        | "assigned"
        | "in_progress"
        | "pending_customer"
        | "resolved"
        | "closed"
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
      agent_tier: ["junior", "experienced", "senior"],
      app_role: ["customer", "agent", "admin"],
      refund_method: ["bank_account", "upi", "transaction"],
      refund_status: ["pending", "approved", "rejected"],
      ticket_priority: ["low", "medium", "high", "critical"],
      ticket_status: [
        "open",
        "assigned",
        "in_progress",
        "pending_customer",
        "resolved",
        "closed",
      ],
    },
  },
} as const
