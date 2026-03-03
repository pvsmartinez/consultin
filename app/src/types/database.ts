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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      appointment_payments: {
        Row: {
          amount_cents: number
          appointment_id: string
          asaas_charge_id: string | null
          asaas_transfer_id: string | null
          clinic_id: string
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          pix_expires_at: string | null
          pix_key: string | null
          status: string
          transfer_amount_cents: number | null
          transfer_status: string | null
          transferred_at: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          appointment_id: string
          asaas_charge_id?: string | null
          asaas_transfer_id?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pix_expires_at?: string | null
          pix_key?: string | null
          status?: string
          transfer_amount_cents?: number | null
          transfer_status?: string | null
          transferred_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string
          asaas_charge_id?: string | null
          asaas_transfer_id?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pix_expires_at?: string | null
          pix_key?: string | null
          status?: string
          transfer_amount_cents?: number | null
          transfer_status?: string | null
          transferred_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_payments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          charge_amount_cents: number | null
          clinic_id: string
          created_at: string
          ends_at: string
          id: string
          notes: string | null
          paid_amount_cents: number | null
          paid_at: string | null
          patient_id: string
          payment_method: string | null
          professional_fee_cents: number | null
          professional_id: string
          room_id: string | null
          service_type_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
        }
        Insert: {
          charge_amount_cents?: number | null
          clinic_id: string
          created_at?: string
          ends_at: string
          id?: string
          notes?: string | null
          paid_amount_cents?: number | null
          paid_at?: string | null
          patient_id: string
          payment_method?: string | null
          professional_fee_cents?: number | null
          professional_id: string
          room_id?: string | null
          service_type_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Update: {
          charge_amount_cents?: number | null
          clinic_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          notes?: string | null
          paid_amount_cents?: number | null
          paid_at?: string | null
          patient_id?: string
          payment_method?: string | null
          professional_fee_cents?: number | null
          professional_id?: string
          room_id?: string | null
          service_type_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "clinic_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          end_time: string
          id: string
          professional_id: string
          room_id: string | null
          start_time: string
          week_parity: string | null
          weekday: number
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          end_time: string
          id?: string
          professional_id: string
          room_id?: string | null
          start_time: string
          week_parity?: string | null
          weekday: number
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          end_time?: string
          id?: string
          professional_id?: string
          room_id?: string | null
          start_time?: string
          week_parity?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "clinic_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_invites: {
        Row: {
          clinic_id: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          name: string | null
          roles: Database["public"]["Enums"]["user_role"][]
          used_at: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          name?: string | null
          roles?: Database["public"]["Enums"]["user_role"][]
          used_at?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          name?: string | null
          roles?: Database["public"]["Enums"]["user_role"][]
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_invites_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_notifications: {
        Row: {
          clinic_id: string
          created_at: string
          data: Json
          id: string
          read_at: string | null
          type: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          type: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_notifications_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_rooms: {
        Row: {
          active: boolean
          clinic_id: string
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_rooms_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_signup_requests: {
        Row: {
          cnpj: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          phone: string | null
          responsible_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          responsible_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          responsible_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      clinics: {
        Row: {
          accepted_payment_methods: string[]
          address: string | null
          allow_professional_selection: boolean
          allow_self_registration: boolean
          anamnesis_fields: Json
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          cancellation_hours: number
          city: string | null
          cnpj: string | null
          created_at: string
          custom_patient_fields: Json
          custom_professional_fields: Json
          email: string | null
          id: string
          name: string
          onboarding_completed: boolean
          patient_field_config: Json
          payment_timing: string
          payments_enabled: boolean
          phone: string | null
          professional_field_config: Json
          slot_duration_minutes: number
          state: string | null
          subscription_status: string | null
          wa_ai_allow_cancel: boolean
          wa_ai_allow_confirm: boolean
          wa_ai_allow_schedule: boolean
          wa_ai_custom_prompt: string | null
          wa_ai_model: string
          wa_attendant_inbox: boolean
          wa_professional_agenda: boolean
          wa_reminders_d0: boolean
          wa_reminders_d1: boolean
          whatsapp_enabled: boolean
          whatsapp_phone_display: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_token: string | null
          whatsapp_token_secret_id: string | null
          whatsapp_verify_token: string | null
          whatsapp_waba_id: string | null
          working_hours: Json
        }
        Insert: {
          accepted_payment_methods?: string[]
          address?: string | null
          allow_professional_selection?: boolean
          allow_self_registration?: boolean
          anamnesis_fields?: Json
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          cancellation_hours?: number
          city?: string | null
          cnpj?: string | null
          created_at?: string
          custom_patient_fields?: Json
          custom_professional_fields?: Json
          email?: string | null
          id?: string
          name: string
          onboarding_completed?: boolean
          patient_field_config?: Json
          payment_timing?: string
          payments_enabled?: boolean
          phone?: string | null
          professional_field_config?: Json
          slot_duration_minutes?: number
          state?: string | null
          subscription_status?: string | null
          wa_ai_allow_cancel?: boolean
          wa_ai_allow_confirm?: boolean
          wa_ai_allow_schedule?: boolean
          wa_ai_custom_prompt?: string | null
          wa_ai_model?: string
          wa_attendant_inbox?: boolean
          wa_professional_agenda?: boolean
          wa_reminders_d0?: boolean
          wa_reminders_d1?: boolean
          whatsapp_enabled?: boolean
          whatsapp_phone_display?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_token?: string | null
          whatsapp_token_secret_id?: string | null
          whatsapp_verify_token?: string | null
          whatsapp_waba_id?: string | null
          working_hours?: Json
        }
        Update: {
          accepted_payment_methods?: string[]
          address?: string | null
          allow_professional_selection?: boolean
          allow_self_registration?: boolean
          anamnesis_fields?: Json
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          cancellation_hours?: number
          city?: string | null
          cnpj?: string | null
          created_at?: string
          custom_patient_fields?: Json
          custom_professional_fields?: Json
          email?: string | null
          id?: string
          name?: string
          onboarding_completed?: boolean
          patient_field_config?: Json
          payment_timing?: string
          payments_enabled?: boolean
          phone?: string | null
          professional_field_config?: Json
          slot_duration_minutes?: number
          state?: string | null
          subscription_status?: string | null
          wa_ai_allow_cancel?: boolean
          wa_ai_allow_confirm?: boolean
          wa_ai_allow_schedule?: boolean
          wa_ai_custom_prompt?: string | null
          wa_ai_model?: string
          wa_attendant_inbox?: boolean
          wa_professional_agenda?: boolean
          wa_reminders_d0?: boolean
          wa_reminders_d1?: boolean
          whatsapp_enabled?: boolean
          whatsapp_phone_display?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_token?: string | null
          whatsapp_token_secret_id?: string | null
          whatsapp_verify_token?: string | null
          whatsapp_waba_id?: string | null
          working_hours?: Json
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          appointment_id: string | null
          channel: string
          clinic_id: string
          error_message: string | null
          id: string
          patient_id: string | null
          sent_at: string
          status: string
          type: string
          wa_message_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          channel: string
          clinic_id: string
          error_message?: string | null
          id?: string
          patient_id?: string | null
          sent_at?: string
          status?: string
          type: string
          wa_message_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          channel?: string
          clinic_id?: string
          error_message?: string | null
          id?: string
          patient_id?: string | null
          sent_at?: string
          status?: string
          type?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_files: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          mime_type: string | null
          name: string
          patient_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          patient_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          patient_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_files_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_files_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_records: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          content: string | null
          created_at: string
          created_by: string
          file_mime: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          patient_id: string
          type: Database["public"]["Enums"]["record_type"]
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          content?: string | null
          created_at?: string
          created_by: string
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          patient_id: string
          type?: Database["public"]["Enums"]["record_type"]
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          content?: string | null
          created_at?: string
          created_by?: string
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          patient_id?: string
          type?: Database["public"]["Enums"]["record_type"]
        }
        Relationships: [
          {
            foreignKeyName: "patient_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_records_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          anamnesis_data: Json
          birth_date: string | null
          clinic_id: string
          cpf: string | null
          created_at: string
          custom_fields: Json
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          rg: string | null
          sex: string | null
          user_id: string | null
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          anamnesis_data?: Json
          birth_date?: string | null
          clinic_id: string
          cpf?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          rg?: string | null
          sex?: string | null
          user_id?: string | null
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          anamnesis_data?: Json
          birth_date?: string | null
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rg?: string | null
          sex?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_bank_accounts: {
        Row: {
          account: string
          account_digit: string | null
          account_type: string
          active: boolean
          agency: string
          agency_digit: string | null
          asaas_transfer_id: string | null
          bank_code: string
          bank_name: string
          clinic_id: string
          created_at: string
          id: string
          owner_cpf_cnpj: string
          owner_name: string
          professional_id: string
          updated_at: string
        }
        Insert: {
          account: string
          account_digit?: string | null
          account_type: string
          active?: boolean
          agency: string
          agency_digit?: string | null
          asaas_transfer_id?: string | null
          bank_code: string
          bank_name: string
          clinic_id: string
          created_at?: string
          id?: string
          owner_cpf_cnpj: string
          owner_name: string
          professional_id: string
          updated_at?: string
        }
        Update: {
          account?: string
          account_digit?: string | null
          account_type?: string
          active?: boolean
          agency?: string
          agency_digit?: string | null
          asaas_transfer_id?: string | null
          bank_code?: string
          bank_name?: string
          clinic_id?: string
          created_at?: string
          id?: string
          owner_cpf_cnpj?: string
          owner_name?: string
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_bank_accounts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_bank_accounts_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean
          clinic_id: string
          council_id: string | null
          created_at: string
          custom_fields: Json
          email: string | null
          id: string
          name: string
          phone: string | null
          specialty: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          clinic_id: string
          council_id?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          specialty?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          clinic_id?: string
          council_id?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          specialty?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          active: boolean
          clinic_id: string
          color: string
          created_at: string
          duration_minutes: number
          id: string
          name: string
          price_cents: number | null
        }
        Insert: {
          active?: boolean
          clinic_id: string
          color?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name: string
          price_cents?: number | null
        }
        Update: {
          active?: boolean
          clinic_id?: string
          color?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_types_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_clinic_memberships: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          professional_id: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          professional_id?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          professional_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_clinic_memberships_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_clinic_memberships_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          clinic_id: string | null
          cpf: string | null
          created_at: string
          id: string
          is_super_admin: boolean
          name: string
          permission_overrides: Json
          roles: Database["public"]["Enums"]["user_role"][]
        }
        Insert: {
          avatar_url?: string | null
          clinic_id?: string | null
          cpf?: string | null
          created_at?: string
          id: string
          is_super_admin?: boolean
          name: string
          permission_overrides?: Json
          roles?: Database["public"]["Enums"]["user_role"][]
        }
        Update: {
          avatar_url?: string | null
          clinic_id?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          is_super_admin?: boolean
          name?: string
          permission_overrides?: Json
          roles?: Database["public"]["Enums"]["user_role"][]
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_faqs: {
        Row: {
          active: boolean
          answer: string
          clinic_id: string
          created_at: string
          id: string
          question: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          answer: string
          clinic_id: string
          created_at?: string
          id?: string
          question: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          answer?: string
          clinic_id?: string
          created_at?: string
          id?: string
          question?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_faqs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          clinic_id: string
          created_at: string
          delivery_status: string | null
          direction: string
          id: string
          message_type: string
          sent_by: string
          session_id: string
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          clinic_id: string
          created_at?: string
          delivery_status?: string | null
          direction: string
          id?: string
          message_type?: string
          sent_by?: string
          session_id: string
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          clinic_id?: string
          created_at?: string
          delivery_status?: string | null
          direction?: string
          id?: string
          message_type?: string
          sent_by?: string
          session_id?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sessions: {
        Row: {
          ai_draft: string | null
          clinic_id: string
          context_snapshot: Json
          created_at: string
          id: string
          last_message_at: string
          patient_id: string | null
          status: string
          wa_phone: string
        }
        Insert: {
          ai_draft?: string | null
          clinic_id: string
          context_snapshot?: Json
          created_at?: string
          id?: string
          last_message_at?: string
          patient_id?: string | null
          status?: string
          wa_phone: string
        }
        Update: {
          ai_draft?: string | null
          clinic_id?: string
          context_snapshot?: Json
          created_at?: string
          id?: string
          last_message_at?: string
          patient_id?: string | null
          status?: string
          wa_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sessions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sessions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body_preview: string
          clinic_id: string
          created_at: string
          enabled: boolean
          id: string
          language: string
          meta_template_name: string
          template_key: string
        }
        Insert: {
          body_preview: string
          clinic_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          language?: string
          meta_template_name: string
          template_key: string
        }
        Update: {
          body_preview?: string
          clinic_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          language?: string
          meta_template_name?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _normalise_cpf: { Args: { raw: string }; Returns: string }
      admin_clinic_stats: {
        Args: never
        Returns: {
          appointments_this_month: number
          appointments_total: number
          clinic_id: string
          clinic_name: string
          patients_count: number
          professionals_count: number
        }[]
      }
      clinic_month_revenue: {
        Args: { p_month_end: string; p_month_start: string }
        Returns: number
      }
      current_user_clinic_id: { Args: never; Returns: string }
      current_user_has_role: {
        Args: { r: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      current_user_is_super_admin: { Args: never; Returns: boolean }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      find_user_by_cpf: {
        Args: { search_cpf: string }
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      get_clinic_whatsapp_token: {
        Args: { p_clinic_id: string }
        Returns: string
      }
      professional_patient_count: {
        Args: { p_professional_id: string }
        Returns: number
      }
      store_clinic_whatsapp_token: {
        Args: { p_clinic_id: string; p_token: string }
        Returns: undefined
      }
      upsert_availability_slots: {
        Args: { p_clinic_id: string; p_professional_id: string; p_slots: Json }
        Returns: undefined
      }
    }
    Enums: {
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      record_type: "note" | "attachment"
      user_role: "admin" | "receptionist" | "professional" | "patient"
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
      appointment_status: [
        "scheduled",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      record_type: ["note", "attachment"],
      user_role: ["admin", "receptionist", "professional", "patient"],
    },
  },
} as const
