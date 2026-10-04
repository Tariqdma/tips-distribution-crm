// Generated from the deployed Supabase database (project luqrrjhvaremronfcvaf).
// Regenerate after schema changes; do not edit by hand.

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
      bonus_policy_settings: {
        Row: {
          cash_bonus_percent: number | null
          credit_bonus_base: number | null
          credit_bonus_reduction_rate: number | null
          id: string
          max_credit_weeks: number | null
        }
        Insert: {
          cash_bonus_percent?: number | null
          credit_bonus_base?: number | null
          credit_bonus_reduction_rate?: number | null
          id?: string
          max_credit_weeks?: number | null
        }
        Update: {
          cash_bonus_percent?: number | null
          credit_bonus_base?: number | null
          credit_bonus_reduction_rate?: number | null
          id?: string
          max_credit_weeks?: number | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          description: string | null
          id: string
          name: string
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          address: string | null
          assigned_to: string | null
          client_name: string | null
          created_at: string | null
          delivered_time: string | null
          delivery_date: string | null
          dispatch_time: string | null
          id: string
          invoice_id: string | null
          payment_collected: number | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          remarks: string | null
          status: Database["public"]["Enums"]["delivery_status"] | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          client_name?: string | null
          created_at?: string | null
          delivered_time?: string | null
          delivery_date?: string | null
          dispatch_time?: string | null
          id?: string
          invoice_id?: string | null
          payment_collected?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["delivery_status"] | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          client_name?: string | null
          created_at?: string | null
          delivered_time?: string | null
          delivery_date?: string | null
          dispatch_time?: string | null
          id?: string
          invoice_id?: string | null
          payment_collected?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["delivery_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tracking_events: {
        Row: {
          delivery_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          status_update: string | null
          timestamp: string | null
        }
        Insert: {
          delivery_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          status_update?: string | null
          timestamp?: string | null
        }
        Update: {
          delivery_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          status_update?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tracking_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      dosage_forms: {
        Row: {
          description: string | null
          id: string
          name: string
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          id: string
          invoice_id: string | null
          price: number
          product_id: string | null
          product_name: string | null
          quantity: number
          strength: string | null
        }
        Insert: {
          id?: string
          invoice_id?: string | null
          price: number
          product_id?: string | null
          product_name?: string | null
          quantity: number
          strength?: string | null
        }
        Update: {
          id?: string
          invoice_id?: string | null
          price?: number
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          strength?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string | null
          client_name: string | null
          created_at: string | null
          credit_weeks: number | null
          delivery_id: string | null
          due_date: string | null
          id: string
          issue_date: string
          paid_amount: number | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          sales_officer_id: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
        }
        Insert: {
          amount: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string | null
          credit_weeks?: number | null
          delivery_id?: string | null
          due_date?: string | null
          id?: string
          issue_date: string
          paid_amount?: number | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          sales_officer_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string | null
          credit_weeks?: number | null
          delivery_id?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string
          paid_amount?: number | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          sales_officer_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_officer_id_fkey"
            columns: ["sales_officer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pack_sizes: {
        Row: {
          description: string | null
          id: string
          name: string
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      payment_records: {
        Row: {
          amount: number
          date: string | null
          id: string
          invoice_id: string | null
        }
        Insert: {
          amount: number
          date?: string | null
          id?: string
          invoice_id?: string | null
        }
        Update: {
          amount?: number
          date?: string | null
          id?: string
          invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_bonus: number | null
          batch_number: string | null
          category_id: string | null
          cost: number | null
          created_at: string | null
          description: string | null
          dosage_form_id: string | null
          expiry_date: string | null
          generic_name: string
          id: string
          image_url: string | null
          manufacturer: string | null
          manufacturing_date: string | null
          name: string
          pack_size_id: string | null
          price: number
          status: string | null
          stock: number | null
          strength: string | null
          supplier_id: string | null
          updated_at: string | null
        }
        Insert: {
          base_bonus?: number | null
          batch_number?: string | null
          category_id?: string | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          dosage_form_id?: string | null
          expiry_date?: string | null
          generic_name: string
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          manufacturing_date?: string | null
          name: string
          pack_size_id?: string | null
          price: number
          status?: string | null
          stock?: number | null
          strength?: string | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Update: {
          base_bonus?: number | null
          batch_number?: string | null
          category_id?: string | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          dosage_form_id?: string | null
          expiry_date?: string | null
          generic_name?: string
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          manufacturing_date?: string | null
          name?: string
          pack_size_id?: string | null
          price?: number
          status?: string | null
          stock?: number | null
          strength?: string | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_dosage_form_id_fkey"
            columns: ["dosage_form_id"]
            isOneToOne: false
            referencedRelation: "dosage_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_pack_size_id_fkey"
            columns: ["pack_size_id"]
            isOneToOne: false
            referencedRelation: "pack_sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          amount_paid: number | null
          created_at: string | null
          date: string | null
          id: string
          invoice_number: string | null
          payment_due_date: string | null
          status: Database["public"]["Enums"]["purchase_invoice_status"] | null
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number | null
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string | null
          date?: string | null
          id?: string
          invoice_number?: string | null
          payment_due_date?: string | null
          status?: Database["public"]["Enums"]["purchase_invoice_status"] | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number | null
        }
        Update: {
          amount_paid?: number | null
          created_at?: string | null
          date?: string | null
          id?: string
          invoice_number?: string | null
          payment_due_date?: string | null
          status?: Database["public"]["Enums"]["purchase_invoice_status"] | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          batch_number: string | null
          brand_name: string | null
          expiry_date: string | null
          generic_name: string | null
          id: string
          product_id: string | null
          purchase_invoice_id: string | null
          purchase_price: number | null
          quantity: number | null
          sell_price: number | null
          total_cost: number | null
        }
        Insert: {
          batch_number?: string | null
          brand_name?: string | null
          expiry_date?: string | null
          generic_name?: string | null
          id?: string
          product_id?: string | null
          purchase_invoice_id?: string | null
          purchase_price?: number | null
          quantity?: number | null
          sell_price?: number | null
          total_cost?: number | null
        }
        Update: {
          batch_number?: string | null
          brand_name?: string | null
          expiry_date?: string | null
          generic_name?: string | null
          id?: string
          product_id?: string | null
          purchase_invoice_id?: string | null
          purchase_price?: number | null
          quantity?: number | null
          sell_price?: number | null
          total_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payments: {
        Row: {
          amount: number | null
          date: string | null
          id: string
          method: Database["public"]["Enums"]["purchase_payment_method"] | null
          purchase_invoice_id: string | null
          remarks: string | null
        }
        Insert: {
          amount?: number | null
          date?: string | null
          id?: string
          method?: Database["public"]["Enums"]["purchase_payment_method"] | null
          purchase_invoice_id?: string | null
          remarks?: string | null
        }
        Update: {
          amount?: number | null
          date?: string | null
          id?: string
          method?: Database["public"]["Enums"]["purchase_payment_method"] | null
          purchase_invoice_id?: string | null
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payments_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          balance: number | null
          contact: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
        }
        Insert: {
          address?: string | null
          balance?: number | null
          contact?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
        }
        Update: {
          address?: string | null
          balance?: number | null
          contact?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          commission_rate: number | null
          created_at: string | null
          credit_limit: number | null
          credit_used: number | null
          email: string
          id: string
          license_number: string | null
          license_url: string | null
          license_verified: boolean | null
          name: string
          password_hash: string | null
          pharmacy_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"] | null
          updated_at: string | null
        }
        Insert: {
          commission_rate?: number | null
          created_at?: string | null
          credit_limit?: number | null
          credit_used?: number | null
          email: string
          id?: string
          license_number?: string | null
          license_url?: string | null
          license_verified?: boolean | null
          name: string
          password_hash?: string | null
          pharmacy_name?: string | null
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"] | null
          updated_at?: string | null
        }
        Update: {
          commission_rate?: number | null
          created_at?: string | null
          credit_limit?: number | null
          credit_used?: number | null
          email?: string
          id?: string
          license_number?: string | null
          license_url?: string | null
          license_verified?: boolean | null
          name?: string
          password_hash?: string | null
          pharmacy_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: { Args: { user_id: string }; Returns: string }
      tips_crm_accept_invite: {
        Args: { token: string }
        Returns: {
          role_key: string
          territory_label: string
        }[]
      }
      tips_crm_add_company_request_note: {
        Args: {
          target_is_internal?: boolean
          target_note_text: string
          target_request_id: string
        }
        Returns: string
      }
      tips_crm_adjust_medical_material_stock: {
        Args: { material_uuid: string; note?: string; quantity_change: number }
        Returns: boolean
      }
      tips_crm_allocate_medical_material: {
        Args: {
          allocation_quantity: number
          material_uuid: string
          note?: string
          rep_uuid: string
        }
        Returns: boolean
      }
      tips_crm_approve_company_request: {
        Args: {
          approved_slug: string
          manager_email: string
          manager_full_name: string
          selected_plan_key?: string
          target_profile_id: string
          target_request_id: string
        }
        Returns: string
      }
      tips_crm_audit_feed: {
        Args: never
        Returns: {
          action: string
          actor_name: string
          created_at: string
          details: Json
          entity_id: string
          entity_type: string
          id: number
        }[]
      }
      tips_crm_check_company_user_limit: {
        Args: { target_company_id: string }
        Returns: {
          active_user_count: number
          can_add: boolean
          max_user_limit: number
          payment_tier_key: string
        }[]
      }
      tips_crm_claim_first_system_admin: { Args: never; Returns: boolean }
      tips_crm_confirm_proforma_client: {
        Args: {
          attachment_path_input?: string
          confirmation_method_input: string
          confirmation_note_input: string
          confirmed_at_input: string
          confirmer_name_input: string
          target_proforma_id: string
        }
        Returns: {
          client_confirmed_at: string
          id: string
          status: string
          updated_at: string
        }[]
      }
      tips_crm_create_company_request: {
        Args: {
          request_activity_type?: string
          request_company_name: string
          request_contact_email: string
          request_contact_name: string
          request_contact_phone?: string
          request_expected_user_count?: number
          request_notes?: string
        }
        Returns: string
      }
      tips_crm_create_invite: {
        Args: {
          invite_role_key: string
          invite_territory?: string
          invitee_email: string
        }
        Returns: {
          expires_at: string
          invite_id: string
          invite_token: string
        }[]
      }
      tips_crm_create_medical_event: {
        Args: {
          doctor_ids: string[]
          event_city: string
          event_ends_at: string
          event_notes: string
          event_product: string
          event_starts_at: string
          event_state: string
          event_title: string
          event_topic: string
          event_venue: string
          rep_uuid: string
        }
        Returns: string
      }
      tips_crm_create_medical_material: {
        Args: {
          material_kind: string
          material_name: string
          material_unit: string
        }
        Returns: string
      }
      tips_crm_create_plan: {
        Args: {
          ends_on: string
          plan_title: string
          plan_type: string
          starts_on: string
        }
        Returns: string
      }
      tips_crm_deactivate_role: { Args: { role_key: string }; Returns: boolean }
      tips_crm_deliver_medical_material: {
        Args: {
          confirmed?: boolean
          delivery_note?: string
          delivery_quantity: number
          doctor_uuid: string
          material_uuid: string
        }
        Returns: string
      }
      tips_crm_export_report_feed: {
        Args: {
          report_end?: string
          report_rep_id?: string
          report_start?: string
        }
        Returns: {
          actor_name: string
          details: string
          occurred_at: string
          record_type: string
          status: string
          title: string
        }[]
      }
      tips_crm_finalize_employee_account: {
        Args: {
          employee_email: string
          employee_force_password_change: boolean
          employee_full_name: string
          employee_role_key: string
          employee_territory_keys: string[]
          target_profile_id: string
        }
        Returns: boolean
      }
      tips_crm_get_company_operational_setup: {
        Args: never
        Returns: {
          account_count: number
          activity_type: string
          business_phone: string
          company_id: string
          company_name: string
          completed_at: string
          geofence_enforcement: boolean
          gps_tracking_required: boolean
          is_setup_complete: boolean
          legal_name: string
          outside_visit_tracking: boolean
          support_email: string
          team_member_count: number
          territory_count: number
          timezone: string
          workday_ends_at: string
          workday_starts_at: string
          working_days: string[]
        }[]
      }
      tips_crm_get_company_request_public_status: {
        Args: { reference_id: string }
        Returns: {
          company_name: string
          reference_number: string
          status: string
          submitted_at: string
          updated_at: string
        }[]
      }
      tips_crm_get_mail_settings: {
        Args: never
        Returns: {
          invite_action_label: string
          invite_intro: string
          invite_subject: string
          reply_to: string
          sender_name: string
          updated_at: string
        }[]
      }
      tips_crm_import_catalog_products: {
        Args: { import_rows: Json }
        Returns: {
          import_status: string
          message: string
          product_id: string
          product_name: string
          row_number: number
          sku: string
        }[]
      }
      tips_crm_issue_proforma: {
        Args: { target_proforma_id: string }
        Returns: {
          currency: string
          id: string
          issued_at: string
          proforma_number: number
          status: string
          subtotal: number
          updated_at: string
        }[]
      }
      tips_crm_list_accounts: {
        Args: never
        Returns: {
          account_type: string
          address: string
          area: string
          city: string
          created_at: string
          id: string
          local_ref: string
          name: string
          phone: string
          specialty: string
          state: string
        }[]
      }
      tips_crm_list_catalog_products_v2: {
        Args: { include_inactive?: boolean }
        Returns: {
          category: string
          description: string
          id: string
          image_url: string
          is_active: boolean
          is_orderable: boolean
          list_price: number
          name: string
          pack_size: string
          price_currency: string
          scientific_name: string
          sku: string
          unit_label: string
        }[]
      }
      tips_crm_list_daily_collections: {
        Args: { report_day: string }
        Returns: {
          account_id: string
          account_name: string
          account_type: string
          area: string
          checked_in_at: string
          city: string
          collection_amount: number
          notes: string
          outcome: string
          receipt_reference: string
          rep_id: string
          rep_name: string
          report_date: string
          revenue_amount: number
          state: string
          territory_name: string
          visit_id: string
        }[]
      }
      tips_crm_list_invite_email_deliveries: {
        Args: never
        Returns: {
          actor_name: string
          created_at: string
          failure_reason: string
          id: string
          invite_id: string
          provider_message_id: string
          recipient_email: string
          status: string
        }[]
      }
      tips_crm_list_invites: {
        Args: never
        Returns: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invite_token: string
          role_key: string
          status: string
          territory_label: string
        }[]
      }
      tips_crm_list_monthly_target_performance: {
        Args: { months_back?: number }
        Returns: {
          actual_value: number
          metric: string
          month_start: string
          target_key: string
          target_type: string
        }[]
      }
      tips_crm_list_monthly_targets: {
        Args: { from_month: string }
        Returns: {
          alert_threshold: number
          id: string
          metric: string
          month_start: string
          target_key: string
          target_type: string
          target_value: number
          updated_at: string
        }[]
      }
      tips_crm_list_my_notifications: {
        Args: never
        Returns: {
          body: string
          created_at: string
          id: string
          kind: string
          read_at: string
          title: string
        }[]
      }
      tips_crm_list_my_proformas: {
        Args: never
        Returns: {
          account_id: string
          account_name: string
          account_type: string
          created_at: string
          currency: string
          id: string
          issued_at: string
          lines: Json
          notes: string
          proforma_number: number
          source_visit_local_ref: string
          status: string
          subtotal: number
          updated_at: string
        }[]
      }
      tips_crm_list_my_visit_samples: {
        Args: never
        Returns: {
          available_quantity: number
          material_id: string
          name: string
          unit_label: string
        }[]
      }
      tips_crm_list_plans: {
        Args: never
        Returns: {
          completed_visits: number
          created_at: string
          ends_on: string
          id: string
          last_visit_at: string
          last_visit_name: string
          manager_note: string
          needs_review_visits: number
          owner_name: string
          owner_territory: string
          plan_type: string
          scheduled_visits: Json
          starts_on: string
          status: string
          title: string
        }[]
      }
      tips_crm_list_platform_companies: {
        Args: never
        Returns: {
          active_user_count: number
          company_id: string
          company_name: string
          company_slug: string
          created_at: string
          max_user_limit: number
          payment_tier_key: string
          plan_key: string
          primary_manager_email: string
          primary_manager_name: string
          status: string
        }[]
      }
      tips_crm_list_platform_company_requests: {
        Args: never
        Returns: {
          activity_type: string
          approved_company_id: string
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          expected_user_count: number
          id: string
          invitation_activated_at: string
          invitation_cancelled_at: string
          invitation_sent_at: string
          latest_email_status: string
          manager_email: string
          manager_full_name: string
          notes: string
          review_note: string
          status: string
        }[]
      }
      tips_crm_list_products: {
        Args: never
        Returns: {
          category: string
          description: string
          id: string
          name: string
          unit_label: string
        }[]
      }
      tips_crm_list_report_reps: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      tips_crm_list_review_proformas: {
        Args: never
        Returns: {
          account_id: string
          account_name: string
          account_type: string
          client_confirmation_attachment_path: string
          client_confirmation_method: string
          client_confirmation_note: string
          client_confirmed_at: string
          client_confirmer_name: string
          created_at: string
          currency: string
          id: string
          issued_at: string
          lines: Json
          manager_note: string
          notes: string
          proforma_number: number
          rep_id: string
          rep_name: string
          status: string
          subtotal: number
          updated_at: string
        }[]
      }
      tips_crm_list_roles: {
        Args: never
        Returns: {
          description: string
          display_name: string
          is_active: boolean
          is_system: boolean
          key: string
          permissions: string[]
        }[]
      }
      tips_crm_list_team_visits: {
        Args: { from_on?: string; to_on?: string }
        Returns: {
          account_id: string
          account_local_ref: string
          account_name: string
          check_in_latitude: number
          check_in_longitude: number
          checked_in_at: string
          collection_amount: number
          created_at: string
          follow_up_action: string
          follow_up_on: string
          id: string
          location_accuracy_meters: number
          notes: string
          offline_client_ref: string
          outcome: string
          receipt_reference: string
          rep_id: string
          rep_name: string
          revenue_amount: number
          status: string
          visit_priority: string
        }[]
      }
      tips_crm_list_territories: {
        Args: never
        Returns: {
          boundary_geojson: Json
          center_latitude: number
          center_longitude: number
          city: string
          client_key: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          radius_meters: number
          state: string
          updated_at: string
        }[]
      }
      tips_crm_list_territory_exit_alerts: {
        Args: { from_at?: string; target_profile_id?: string; to_at?: string }
        Returns: {
          body: string
          employee_id: string
          employee_name: string
          id: string
          occurred_at: string
          status: string
          territory_key: string
          territory_name: string
          title: string
        }[]
      }
      tips_crm_list_visit_market_insights: {
        Args: { report_limit?: number }
        Returns: {
          account_name: string
          account_type: string
          competitor_notes: string
          follow_up_recommendation: string
          market_feedback: string
          representative_name: string
          visit_id: string
          visited_at: string
        }[]
      }
      tips_crm_list_visit_outcomes: {
        Args: never
        Returns: {
          id: string
          is_active: boolean
          label: string
          sort_order: number
        }[]
      }
      tips_crm_mark_company_manager_activation: {
        Args: never
        Returns: boolean
      }
      tips_crm_mark_password_changed: { Args: never; Returns: boolean }
      tips_crm_medical_event_overview: {
        Args: never
        Returns: {
          assigned_rep_id: string
          attended_count: number
          city: string
          confirmed_count: number
          ends_at: string
          event_id: string
          focus_product: string
          follow_up_count: number
          invite_count: number
          notes: string
          rep_name: string
          starts_at: string
          state: string
          title: string
          topic: string
          venue: string
        }[]
      }
      tips_crm_medical_material_overview: {
        Args: never
        Returns: {
          allocated_quantity: number
          central_quantity: number
          delivered_quantity: number
          material_id: string
          material_type: string
          name: string
          unit_label: string
        }[]
      }
      tips_crm_medical_target_progress: {
        Args: { target_month: string }
        Returns: {
          actual: number
          alert_threshold: number
          label: string
          metric: string
          target_id: string
          target_key: string
          target_type: string
          target_value: number
        }[]
      }
      tips_crm_medical_visit_report: {
        Args: { end_on: string; start_on: string }
        Returns: {
          city: string
          completed_visits: number
          high_interest: number
          in_person_visits: number
          pending_follow_ups: number
          promoted_products: string[]
          remote_visits: number
          rep_id: string
          rep_name: string
          requested_info: number
          specialty: string
          state: string
          total_visits: number
        }[]
      }
      tips_crm_my_medical_material_stock: {
        Args: never
        Returns: {
          material_id: string
          material_type: string
          name: string
          quantity: number
          unit_label: string
        }[]
      }
      tips_crm_my_profile: {
        Args: never
        Returns: {
          active_company_id: string
          active_company_name: string
          active_company_slug: string
          disciplines: string[]
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_platform_admin: boolean
          membership_permissions: string[]
          must_change_password: boolean
          permissions: string[]
          role_key: string
          role_name: string
        }[]
      }
      tips_crm_my_profile_v2: {
        Args: never
        Returns: {
          active_company_id: string
          active_company_name: string
          active_company_slug: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_platform_admin: boolean
          must_change_password: boolean
          permissions: string[]
          role_key: string
          role_name: string
        }[]
      }
      tips_crm_my_workspace: { Args: never; Returns: Json }
      tips_crm_prepare_invite_email: {
        Args: { target_invite_id: string }
        Returns: {
          expires_at: string
          invite_action_label: string
          invite_id: string
          invite_intro: string
          invite_subject: string
          invite_token: string
          recipient_email: string
          reply_to: string
          role_label: string
          sender_name: string
          territory_label: string
        }[]
      }
      tips_crm_prepare_plan_submission_email: {
        Args: { target_plan_id: string }
        Returns: {
          manager_email: string
          manager_name: string
          period_label: string
          plan_title: string
          rep_name: string
        }[]
      }
      tips_crm_product_visit_report: {
        Args: { report_limit?: number }
        Returns: {
          category: string
          competitor_note_count: number
          information_requests: number
          interactions: number
          latest_activity_at: string
          market_feedback_count: number
          order_interest: number
          product_id: string
          product_name: string
          promotions: number
        }[]
      }
      tips_crm_raise_territory_exit_alert: {
        Args: { captured_at_input?: string; territory_key: string }
        Returns: boolean
      }
      tips_crm_record_invite_email_delivery: {
        Args: {
          error_reason?: string
          next_status: string
          provider_id?: string
          target_email: string
          target_invite_id: string
        }
        Returns: string
      }
      tips_crm_record_visit_sample_deliveries: {
        Args: { delivery_lines?: Json; target_visit_id: string }
        Returns: undefined
      }
      tips_crm_request_company_info: {
        Args: { information_needed: string; target_request_id: string }
        Returns: boolean
      }
      tips_crm_resend_invite: {
        Args: { invite_id: string }
        Returns: {
          expires_at: string
          invite_token: string
        }[]
      }
      tips_crm_review_company_request: {
        Args: {
          next_review_note?: string
          next_status: string
          target_request_id: string
        }
        Returns: boolean
      }
      tips_crm_review_plan: {
        Args: { next_status: string; note?: string; target_plan_id: string }
        Returns: boolean
      }
      tips_crm_review_proforma: {
        Args: {
          decision_input: string
          manager_note_input?: string
          target_proforma_id: string
        }
        Returns: {
          id: string
          reviewed_at: string
          status: string
          updated_at: string
        }[]
      }
      tips_crm_revoke_invite: { Args: { invite_id: string }; Returns: boolean }
      tips_crm_save_catalog_product_v2: {
        Args: {
          product_category?: string
          product_currency?: string
          product_description?: string
          product_image_url?: string
          product_is_orderable?: boolean
          product_list_price?: number
          product_name: string
          product_pack_size?: string
          product_scientific_name?: string
          product_sku: string
          product_unit_label?: string
          target_product_id: string
        }
        Returns: string
      }
      tips_crm_save_company_operational_setup: {
        Args: {
          input_activity_type: string
          input_business_phone: string
          input_company_name: string
          input_geofence_enforcement: boolean
          input_gps_tracking_required: boolean
          input_legal_name: string
          input_outside_visit_tracking: boolean
          input_support_email: string
          input_workday_ends_at: string
          input_workday_starts_at: string
          input_working_days: string[]
        }
        Returns: {
          company_id: string
        }[]
      }
      tips_crm_save_mail_settings: {
        Args: {
          next_invite_action_label: string
          next_invite_intro: string
          next_invite_subject: string
          next_reply_to: string
          next_sender_name: string
        }
        Returns: boolean
      }
      tips_crm_save_medical_target: {
        Args: {
          key_value: string
          kind: string
          metric_value: string
          target_month: string
          threshold?: number
          value: number
        }
        Returns: string
      }
      tips_crm_save_monthly_target: {
        Args: {
          alert_threshold_input: number
          metric_input: string
          month_start_input: string
          target_key_input: string
          target_type_input: string
          target_value_input: number
        }
        Returns: string
      }
      tips_crm_save_plan_visits: {
        Args: { planned_visits: Json; target_plan_id: string }
        Returns: number
      }
      tips_crm_save_product: {
        Args: {
          product_category: string
          product_description: string
          product_name: string
          product_unit_label: string
          target_product_id: string
        }
        Returns: string
      }
      tips_crm_save_proforma_draft: {
        Args: {
          client_draft_ref_input: string
          line_items: Json
          notes_input: string
          source_visit_ref_input: string
          target_account_id: string
          target_proforma_id: string
        }
        Returns: {
          currency: string
          id: string
          proforma_number: number
          status: string
          subtotal: number
          updated_at: string
        }[]
      }
      tips_crm_save_role: {
        Args: {
          role_active?: boolean
          role_description: string
          role_key: string
          role_name: string
          role_permissions: string[]
        }
        Returns: string
      }
      tips_crm_save_visit: {
        Args: {
          account_uuid: string
          accuracy?: number
          latitude?: number
          longitude?: number
          visit_notes: string
          visit_outcome: string
          visit_status: string
        }
        Returns: string
      }
      tips_crm_save_visit_outcome: {
        Args: { outcome_label: string; outcome_sort_order?: number }
        Returns: string
      }
      tips_crm_save_visit_product_context: {
        Args: {
          competitor_notes_input?: string
          follow_up_recommendation_input?: string
          market_feedback_input?: string
          product_lines?: Json
          target_visit_id: string
        }
        Returns: undefined
      }
      tips_crm_save_visit_report: {
        Args: {
          account_uuid: string
          accuracy?: number
          collection_amount_input?: number
          doctor_interest_input?: string
          follow_up_action_input?: string
          follow_up_on_input?: string
          latitude?: number
          longitude?: number
          medical_feedback_input?: string
          medical_interaction_type_input?: string
          medical_prescribing_level_input?: string
          medical_visit_goal_input?: string
          medical_visit_place_input?: string
          offline_client_ref_input?: string
          pharmacy_product_availability_input?: Json
          promoted_product_input?: string
          receipt_reference_input?: string
          revenue_amount_input?: number
          scientific_message_input?: string
          visit_notes: string
          visit_outcome: string
          visit_priority_input?: string
          visit_status: string
        }
        Returns: string
      }
      tips_crm_search_receipt_records: {
        Args: {
          date_from?: string
          date_to?: string
          result_limit?: number
          search_query?: string
        }
        Returns: {
          account_id: string
          account_name: string
          account_phone: string
          account_type: string
          address: string
          area: string
          check_in_latitude: number
          check_in_longitude: number
          checked_in_at: string
          city: string
          collection_amount: number
          follow_up_action: string
          follow_up_on: string
          location_accuracy_meters: number
          notes: string
          outcome: string
          receipt_reference: string
          rep_email: string
          rep_id: string
          rep_name: string
          report_date: string
          revenue_amount: number
          state: string
          territory_name: string
          visit_id: string
          visit_priority: string
        }[]
      }
      tips_crm_set_catalog_product_active: {
        Args: { next_active: boolean; target_product_id: string }
        Returns: undefined
      }
      tips_crm_set_visit_outcome_active: {
        Args: { next_is_active: boolean; outcome_id: string }
        Returns: boolean
      }
      tips_crm_sync_account: {
        Args: {
          account_address: string
          account_area: string
          account_city: string
          account_name: string
          account_phone: string
          account_specialty: string
          account_state: string
          account_type: string
          local_ref_input: string
        }
        Returns: string
      }
      tips_crm_update_company_plan_limit: {
        Args: {
          p_company_id: string
          p_max_user_limit: number
          p_plan_key: string
        }
        Returns: boolean
      }
      tips_crm_update_company_subscription: {
        Args: {
          new_max_user_limit: number
          new_payment_tier_key: string
          target_company_id: string
        }
        Returns: boolean
      }
      tips_crm_update_medical_event_invitation: {
        Args: { invitation_uuid: string; next_status: string; note?: string }
        Returns: boolean
      }
      tips_crm_update_my_profile: {
        Args: { new_avatar_url?: string; new_full_name: string }
        Returns: Json
      }
      tips_crm_update_plan_by_manager: {
        Args: {
          manager_note_input?: string
          planned_visits: Json
          target_plan_id: string
        }
        Returns: boolean
      }
      tips_crm_upsert_territory: {
        Args: {
          center_latitude_input: number
          center_longitude_input: number
          polygon_points_input?: Json
          radius_meters_input: number
          territory_city: string
          territory_key: string
          territory_name: string
          territory_state: string
        }
        Returns: string
      }
    }
    Enums: {
      delivery_status:
        | "Pending"
        | "Dispatched"
        | "In Transit"
        | "Delivered"
        | "Returned"
        | "Cancelled"
      invoice_status: "Paid" | "Unpaid" | "Overdue"
      payment_method: "Cash" | "Bank Transfer" | "Credit"
      purchase_invoice_status:
        | "Draft"
        | "Unpaid"
        | "Partial"
        | "Paid"
        | "Overdue"
      purchase_payment_method: "Cash" | "Bank Transfer" | "Cheque"
      user_role:
        | "Admin"
        | "PharmacyUser"
        | "Accountant"
        | "SalesOfficer"
        | "StoreKeeper"
        | "DeliveryOfficer"
      user_status: "Pending" | "Approved"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      delivery_status: [
        "Pending",
        "Dispatched",
        "In Transit",
        "Delivered",
        "Returned",
        "Cancelled",
      ],
      invoice_status: ["Paid", "Unpaid", "Overdue"],
      payment_method: ["Cash", "Bank Transfer", "Credit"],
      purchase_invoice_status: [
        "Draft",
        "Unpaid",
        "Partial",
        "Paid",
        "Overdue",
      ],
      purchase_payment_method: ["Cash", "Bank Transfer", "Cheque"],
      user_role: [
        "Admin",
        "PharmacyUser",
        "Accountant",
        "SalesOfficer",
        "StoreKeeper",
        "DeliveryOfficer",
      ],
      user_status: ["Pending", "Approved"],
    },
  },
} as const
