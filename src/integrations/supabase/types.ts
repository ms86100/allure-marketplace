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
      action_type_workflow_map: {
        Row: {
          action_type: string
          checkout_mode: string
          creates_order: boolean
          cta_label: string
          cta_short_label: string
          is_active: boolean
          requires_availability: boolean
          requires_price: boolean
          transaction_type: string
        }
        Insert: {
          action_type: string
          checkout_mode?: string
          creates_order?: boolean
          cta_label?: string
          cta_short_label?: string
          is_active?: boolean
          requires_availability?: boolean
          requires_price?: boolean
          transaction_type: string
        }
        Update: {
          action_type?: string
          checkout_mode?: string
          creates_order?: boolean
          cta_label?: string
          cta_short_label?: string
          is_active?: boolean
          requires_availability?: boolean
          requires_price?: boolean
          transaction_type?: string
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      ai_review_log: {
        Row: {
          confidence: number | null
          flags: string[] | null
          id: string
          product_id: string
          review_result: string
          reviewed_at: string
          seller_id: string
          suggestion: string | null
        }
        Insert: {
          confidence?: number | null
          flags?: string[] | null
          id?: string
          product_id: string
          review_result: string
          reviewed_at?: string
          seller_id: string
          suggestion?: string | null
        }
        Update: {
          confidence?: number | null
          flags?: string[] | null
          id?: string
          product_id?: string
          review_result?: string
          reviewed_at?: string
          seller_id?: string
          suggestion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_review_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_review_log_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_block_library: {
        Row: {
          applicable_categories: string[] | null
          block_key: string
          block_type: string
          category_hints: string[] | null
          created_at: string
          default_config: Json | null
          description: string | null
          display_name: string
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean
          renderer_type: string | null
        }
        Insert: {
          applicable_categories?: string[] | null
          block_key: string
          block_type?: string
          category_hints?: string[] | null
          created_at?: string
          default_config?: Json | null
          description?: string | null
          display_name: string
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean
          renderer_type?: string | null
        }
        Update: {
          applicable_categories?: string[] | null
          block_key?: string
          block_type?: string
          category_hints?: string[] | null
          created_at?: string
          default_config?: Json | null
          description?: string | null
          display_name?: string
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean
          renderer_type?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          society_id: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          society_id?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          society_id?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log_archive: {
        Row: {
          action: string
          actor_id: string | null
          archived_at: string
          created_at: string
          id: string
          metadata: Json | null
          society_id: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          archived_at?: string
          created_at: string
          id: string
          metadata?: Json | null
          society_id?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          archived_at?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          society_id?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      authorized_persons: {
        Row: {
          created_at: string | null
          flat_number: string
          id: string
          is_active: boolean | null
          person_name: string
          phone: string | null
          photo_url: string | null
          relationship: string
          resident_id: string
          society_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          flat_number: string
          id?: string
          is_active?: boolean | null
          person_name: string
          phone?: string | null
          photo_url?: string | null
          relationship?: string
          resident_id: string
          society_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          flat_number?: string
          id?: string
          is_active?: boolean | null
          person_name?: string
          phone?: string | null
          photo_url?: string | null
          relationship?: string
          resident_id?: string
          society_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authorized_persons_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorized_persons_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_config: {
        Row: {
          badge_key: string
          color: string | null
          created_at: string
          description: string | null
          display_name: string
          entity_type: string
          icon: string | null
          id: string
          is_active: boolean
          threshold_type: string
          threshold_value: number
        }
        Insert: {
          badge_key: string
          color?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          entity_type?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          threshold_type?: string
          threshold_value?: number
        }
        Update: {
          badge_key?: string
          color?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          entity_type?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          threshold_type?: string
          threshold_value?: number
        }
        Relationships: []
      }
      builder_announcements: {
        Row: {
          attachment_urls: string[] | null
          body: string | null
          builder_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          priority: string
          published_at: string | null
          society_id: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          attachment_urls?: string[] | null
          body?: string | null
          builder_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          published_at?: string | null
          society_id?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          attachment_urls?: string[] | null
          body?: string | null
          builder_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          published_at?: string | null
          society_id?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_announcements_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_announcements_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_feature_packages: {
        Row: {
          builder_id: string
          created_at: string
          id: string
          package_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          builder_id: string
          created_at?: string
          id?: string
          package_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          builder_id?: string
          created_at?: string
          id?: string
          package_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "builder_feature_packages_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_feature_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "feature_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_members: {
        Row: {
          builder_id: string
          created_at: string
          deactivated_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          builder_id: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          builder_id?: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_members_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_societies: {
        Row: {
          builder_id: string
          created_at: string
          id: string
          society_id: string
        }
        Insert: {
          builder_id: string
          created_at?: string
          id?: string
          society_id: string
        }
        Update: {
          builder_id?: string
          created_at?: string
          id?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_societies_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_societies_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      builders: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      bulletin_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          parent_id: string | null
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "bulletin_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_posts: {
        Row: {
          author_id: string
          body: string | null
          comment_count: number | null
          created_at: string
          event_date: string | null
          event_location: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          is_archived: boolean
          is_pinned: boolean
          poll_end_date: string | null
          poll_options: Json | null
          rsvp_limit: number | null
          society_id: string
          tags: string[] | null
          title: string
          type: string
          updated_at: string
          visibility: string
          vote_count: number | null
        }
        Insert: {
          author_id: string
          body?: string | null
          comment_count?: number | null
          created_at?: string
          event_date?: string | null
          event_location?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_archived?: boolean
          is_pinned?: boolean
          poll_end_date?: string | null
          poll_options?: Json | null
          rsvp_limit?: number | null
          society_id: string
          tags?: string[] | null
          title: string
          type?: string
          updated_at?: string
          visibility?: string
          vote_count?: number | null
        }
        Update: {
          author_id?: string
          body?: string | null
          comment_count?: number | null
          created_at?: string
          event_date?: string | null
          event_location?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_archived?: boolean
          is_pinned?: boolean
          poll_end_date?: string | null
          poll_options?: Json | null
          rsvp_limit?: number | null
          society_id?: string
          tags?: string[] | null
          title?: string
          type?: string
          updated_at?: string
          visibility?: string
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_posts_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_rsvps: {
        Row: {
          created_at: string
          id: string
          post_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_rsvps_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_votes: {
        Row: {
          created_at: string
          id: string
          poll_option_index: number | null
          post_id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          poll_option_index?: number | null
          post_id: string
          user_id: string
          vote_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          poll_option_index?: number | null
          post_id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_feedback: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          interaction_id: string
          outcome: string
          seller_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          interaction_id: string
          outcome: string
          seller_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          interaction_id?: string
          outcome?: string
          seller_id?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          body: string
          created_at: string
          created_by: string
          filters: Json | null
          id: string
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number | null
          society_id: string
          status: string
          target_audience: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          filters?: Json | null
          id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          society_id: string
          status?: string
          target_audience?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          filters?: Json | null
          id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          society_id?: string
          status?: string
          target_audience?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          society_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          quantity?: number
          society_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          society_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      category_allowed_action_types: {
        Row: {
          action_type: string
          category_config_id: string
          id: string
        }
        Insert: {
          action_type: string
          category_config_id: string
          id?: string
        }
        Update: {
          action_type?: string
          category_config_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_allowed_action_types_action_type_fkey"
            columns: ["action_type"]
            isOneToOne: false
            referencedRelation: "action_type_workflow_map"
            referencedColumns: ["action_type"]
          },
          {
            foreignKeyName: "category_allowed_action_types_category_config_id_fkey"
            columns: ["category_config_id"]
            isOneToOne: false
            referencedRelation: "category_config"
            referencedColumns: ["id"]
          },
        ]
      }
      category_config: {
        Row: {
          accepts_preorders: boolean
          category: string
          color: string
          created_at: string | null
          default_action_type: string | null
          default_sort: string
          description_placeholder: string | null
          display_name: string
          display_order: number | null
          duration_label: string | null
          enquiry_only: boolean
          has_date_range: boolean
          has_duration: boolean
          has_quantity: boolean
          icon: string
          id: string
          image_url: string | null
          is_active: boolean
          is_negotiable: boolean
          is_physical_product: boolean
          layout_type: string
          lead_time_hours: number | null
          name_placeholder: string | null
          parent_group: string
          placeholder_emoji: string | null
          preorder_cutoff_time: string | null
          price_label: string | null
          price_prefix: string | null
          primary_button_label: string
          requires_availability: boolean
          requires_delivery: boolean
          requires_preparation: boolean
          requires_price: boolean
          requires_time_slot: boolean
          review_dimensions: string[] | null
          show_duration_field: boolean | null
          show_veg_toggle: boolean
          supports_addons: boolean
          supports_cart: boolean
          supports_recurring: boolean
          supports_staff_assignment: boolean
          transaction_type: string
          updated_at: string | null
        }
        Insert: {
          accepts_preorders?: boolean
          category: string
          color: string
          created_at?: string | null
          default_action_type?: string | null
          default_sort?: string
          description_placeholder?: string | null
          display_name: string
          display_order?: number | null
          duration_label?: string | null
          enquiry_only?: boolean
          has_date_range?: boolean
          has_duration?: boolean
          has_quantity?: boolean
          icon: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_negotiable?: boolean
          is_physical_product?: boolean
          layout_type?: string
          lead_time_hours?: number | null
          name_placeholder?: string | null
          parent_group: string
          placeholder_emoji?: string | null
          preorder_cutoff_time?: string | null
          price_label?: string | null
          price_prefix?: string | null
          primary_button_label?: string
          requires_availability?: boolean
          requires_delivery?: boolean
          requires_preparation?: boolean
          requires_price?: boolean
          requires_time_slot?: boolean
          review_dimensions?: string[] | null
          show_duration_field?: boolean | null
          show_veg_toggle?: boolean
          supports_addons?: boolean
          supports_cart?: boolean
          supports_recurring?: boolean
          supports_staff_assignment?: boolean
          transaction_type?: string
          updated_at?: string | null
        }
        Update: {
          accepts_preorders?: boolean
          category?: string
          color?: string
          created_at?: string | null
          default_action_type?: string | null
          default_sort?: string
          description_placeholder?: string | null
          display_name?: string
          display_order?: number | null
          duration_label?: string | null
          enquiry_only?: boolean
          has_date_range?: boolean
          has_duration?: boolean
          has_quantity?: boolean
          icon?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_negotiable?: boolean
          is_physical_product?: boolean
          layout_type?: string
          lead_time_hours?: number | null
          name_placeholder?: string | null
          parent_group?: string
          placeholder_emoji?: string | null
          preorder_cutoff_time?: string | null
          price_label?: string | null
          price_prefix?: string | null
          primary_button_label?: string
          requires_availability?: boolean
          requires_delivery?: boolean
          requires_preparation?: boolean
          requires_price?: boolean
          requires_time_slot?: boolean
          review_dimensions?: string[] | null
          show_duration_field?: boolean | null
          show_veg_toggle?: boolean
          supports_addons?: boolean
          supports_cart?: boolean
          supports_recurring?: boolean
          supports_staff_assignment?: boolean
          transaction_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_category_config_parent_group"
            columns: ["parent_group"]
            isOneToOne: false
            referencedRelation: "parent_groups"
            referencedColumns: ["slug"]
          },
        ]
      }
      category_status_flows: {
        Row: {
          actor: string | null
          created_at: string
          creates_tracking_assignment: boolean
          display_name: string
          id: string
          is_deprecated: boolean
          is_terminal: boolean
          is_transit: boolean
          notification_image_url: string | null
          parent_group: string
          sort_order: number
          starts_live_activity: boolean | null
          status_key: string | null
          statuses: string[]
          transaction_type: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          creates_tracking_assignment?: boolean
          display_name?: string
          id?: string
          is_deprecated?: boolean
          is_terminal?: boolean
          is_transit?: boolean
          notification_image_url?: string | null
          parent_group?: string
          sort_order?: number
          starts_live_activity?: boolean | null
          status_key?: string | null
          statuses?: string[]
          transaction_type: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          creates_tracking_assignment?: boolean
          display_name?: string
          id?: string
          is_deprecated?: boolean
          is_terminal?: boolean
          is_transit?: boolean
          notification_image_url?: string | null
          parent_group?: string
          sort_order?: number
          starts_live_activity?: boolean | null
          status_key?: string | null
          statuses?: string[]
          transaction_type?: string
        }
        Relationships: []
      }
      category_status_transitions: {
        Row: {
          allowed_actor: string
          allowed_roles: string[]
          auto_transition: boolean
          auto_transition_minutes: number | null
          created_at: string
          display_label: string | null
          from_status: string
          id: string
          parent_group: string
          to_status: string
          transaction_type: string
        }
        Insert: {
          allowed_actor?: string
          allowed_roles?: string[]
          auto_transition?: boolean
          auto_transition_minutes?: number | null
          created_at?: string
          display_label?: string | null
          from_status: string
          id?: string
          parent_group?: string
          to_status: string
          transaction_type: string
        }
        Update: {
          allowed_actor?: string
          allowed_roles?: string[]
          auto_transition?: boolean
          auto_transition_minutes?: number | null
          created_at?: string
          display_label?: string | null
          from_status?: string
          id?: string
          parent_group?: string
          to_status?: string
          transaction_type?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string | null
          id: string
          message_text: string
          order_id: string
          read_status: boolean | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_text: string
          order_id: string
          read_status?: boolean | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_text?: string
          order_id?: string
          read_status?: boolean | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_buy_participants: {
        Row: {
          created_at: string
          id: string
          quantity: number
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quantity?: number
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quantity?: number
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collective_buy_participants_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "collective_buy_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_buy_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_buy_requests: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          current_quantity: number
          deadline: string | null
          description: string | null
          id: string
          image_url: string | null
          price_per_unit: number | null
          product_name: string
          society_id: string
          status: string
          target_quantity: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          current_quantity?: number
          deadline?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          price_per_unit?: number | null
          product_name: string
          society_id: string
          status?: string
          target_quantity?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          current_quantity?: number
          deadline?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          price_per_unit?: number | null
          product_name?: string
          society_id?: string
          status?: string
          target_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collective_buy_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_buy_requests_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_escalations: {
        Row: {
          category: string
          created_at: string
          id: string
          resident_count: number
          resolved_at: string | null
          sample_photos: string[] | null
          snag_count: number
          society_id: string
          status: string
          tower_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          resident_count?: number
          resolved_at?: string | null
          sample_photos?: string[] | null
          snag_count?: number
          society_id: string
          status?: string
          tower_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          resident_count?: number
          resolved_at?: string | null
          sample_photos?: string[] | null
          snag_count?: number
          society_id?: string
          status?: string
          tower_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collective_escalations_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_escalations_tower_id_fkey"
            columns: ["tower_id"]
            isOneToOne: false
            referencedRelation: "project_towers"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_milestones: {
        Row: {
          completion_percentage: number | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          image_urls: string[] | null
          milestone_date: string | null
          posted_by: string | null
          progress_percentage: number | null
          society_id: string
          status: string
          title: string
          tower_id: string | null
          updated_at: string
        }
        Insert: {
          completion_percentage?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          image_urls?: string[] | null
          milestone_date?: string | null
          posted_by?: string | null
          progress_percentage?: number | null
          society_id: string
          status?: string
          title: string
          tower_id?: string | null
          updated_at?: string
        }
        Update: {
          completion_percentage?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          image_urls?: string[] | null
          milestone_date?: string | null
          posted_by?: string | null
          progress_percentage?: number | null
          society_id?: string
          status?: string
          title?: string
          tower_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_milestones_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_milestones_tower_id_fkey"
            columns: ["tower_id"]
            isOneToOne: false
            referencedRelation: "project_towers"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          discount_amount: number
          id: string
          order_id: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_discount_amount: number | null
          min_order_amount: number | null
          per_user_limit: number
          seller_id: string
          society_id: string
          times_used: number
          updated_at: string
          usage_limit: number | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number | null
          per_user_limit?: number
          seller_id: string
          society_id: string
          times_used?: number
          updated_at?: string
          usage_limit?: number | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number | null
          per_user_limit?: number
          seller_id?: string
          society_id?: string
          times_used?: number
          updated_at?: string
          usage_limit?: number | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_addresses: {
        Row: {
          block: string | null
          building_name: string | null
          created_at: string
          flat_number: string | null
          floor: string | null
          full_address: string | null
          id: string
          is_default: boolean
          label: string
          landmark: string | null
          latitude: number | null
          longitude: number | null
          phase: string | null
          pincode: string | null
          society_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          block?: string | null
          building_name?: string | null
          created_at?: string
          flat_number?: string | null
          floor?: string | null
          full_address?: string | null
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          phase?: string | null
          pincode?: string | null
          society_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          block?: string | null
          building_name?: string | null
          created_at?: string
          flat_number?: string | null
          floor?: string | null
          full_address?: string | null
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          phase?: string | null
          pincode?: string | null
          society_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_addresses_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_assignments: {
        Row: {
          assigned_at: string | null
          at_gate_at: string | null
          created_at: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_code: string | null
          delivery_fee: number | null
          delivery_lat: number | null
          delivery_lng: number | null
          eta_minutes: number | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          order_id: string
          otp_verified: boolean | null
          partner_id: string | null
          picked_up_at: string | null
          pickup_address: string | null
          rider_name: string | null
          rider_phone: string | null
          society_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          at_gate_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_code?: string | null
          delivery_fee?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          eta_minutes?: number | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          order_id: string
          otp_verified?: boolean | null
          partner_id?: string | null
          picked_up_at?: string | null
          pickup_address?: string | null
          rider_name?: string | null
          rider_phone?: string | null
          society_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          at_gate_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_code?: string | null
          delivery_fee?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          eta_minutes?: number | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          order_id?: string
          otp_verified?: boolean | null
          partner_id?: string | null
          picked_up_at?: string | null
          pickup_address?: string | null
          rider_name?: string | null
          rider_phone?: string | null
          society_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_feedback: {
        Row: {
          buyer_id: string
          comment: string | null
          created_at: string
          id: string
          order_id: string
          rating: number
          seller_id: string
        }
        Insert: {
          buyer_id: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          rating: number
          seller_id: string
        }
        Update: {
          buyer_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          rating?: number
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_locations: {
        Row: {
          accuracy_meters: number | null
          assignment_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          partner_id: string
          recorded_at: string
          speed_kmh: number | null
        }
        Insert: {
          accuracy_meters?: number | null
          assignment_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          partner_id: string
          recorded_at?: string
          speed_kmh?: number | null
        }
        Update: {
          accuracy_meters?: number | null
          assignment_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          partner_id?: string
          recorded_at?: string
          speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_locations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_partner_pool: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          partner_id: string | null
          society_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          partner_id?: string | null
          society_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          partner_id?: string | null
          society_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_partner_pool_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_partner_pool_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_partners: {
        Row: {
          created_at: string
          current_lat: number | null
          current_lng: number | null
          id: string
          is_active: boolean
          is_available: boolean
          name: string
          phone: string
          provider_type: string | null
          society_id: string
          updated_at: string
          user_id: string
          vehicle_type: string | null
        }
        Insert: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          id?: string
          is_active?: boolean
          is_available?: boolean
          name: string
          phone: string
          provider_type?: string | null
          society_id: string
          updated_at?: string
          user_id: string
          vehicle_type?: string | null
        }
        Update: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          id?: string
          is_active?: boolean
          is_available?: boolean
          name?: string
          phone?: string
          provider_type?: string | null
          society_id?: string
          updated_at?: string
          user_id?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_partners_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_partners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_time_stats: {
        Row: {
          avg_delivery_minutes: number | null
          avg_prep_minutes: number | null
          id: string
          seller_id: string
          society_id: string
          total_orders: number | null
          updated_at: string
        }
        Insert: {
          avg_delivery_minutes?: number | null
          avg_prep_minutes?: number | null
          id?: string
          seller_id: string
          society_id: string
          total_orders?: number | null
          updated_at?: string
        }
        Update: {
          avg_delivery_minutes?: number | null
          avg_prep_minutes?: number | null
          id?: string
          seller_id?: string
          society_id?: string
          total_orders?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_time_stats_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_time_stats_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tracking_logs: {
        Row: {
          accuracy: number | null
          assignment_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          source: string | null
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          assignment_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          source?: string | null
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          assignment_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          source?: string | null
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tracking_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          apns_token: string | null
          created_at: string | null
          id: string
          invalid: boolean | null
          invalid_count: number | null
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          apns_token?: string | null
          created_at?: string | null
          id?: string
          invalid?: boolean | null
          invalid_count?: number | null
          platform?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          apns_token?: string | null
          created_at?: string | null
          id?: string
          invalid?: boolean | null
          invalid_count?: number | null
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_comments: {
        Row: {
          attachment_url: string | null
          author_id: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          attachment_url?: string | null
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          attachment_url?: string | null
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "dispute_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_tickets: {
        Row: {
          acknowledged_at: string | null
          against_user: string | null
          assigned_to: string | null
          category: string
          created_at: string
          description: string | null
          evidence_urls: string[] | null
          id: string
          order_id: string
          priority: string
          raised_by: string
          reason: string
          resolution: string | null
          resolution_note: string | null
          resolved_at: string | null
          sla_deadline: string | null
          society_id: string | null
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          against_user?: string | null
          assigned_to?: string | null
          category?: string
          created_at?: string
          description?: string | null
          evidence_urls?: string[] | null
          id?: string
          order_id: string
          priority?: string
          raised_by: string
          reason: string
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          sla_deadline?: string | null
          society_id?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          against_user?: string | null
          assigned_to?: string | null
          category?: string
          created_at?: string
          description?: string | null
          evidence_urls?: string[] | null
          id?: string
          order_id?: string
          priority?: string
          raised_by?: string
          reason?: string
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          sla_deadline?: string | null
          society_id?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_tickets_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      domestic_help_attendance: {
        Row: {
          check_in_at: string
          check_out_at: string | null
          created_at: string
          date: string
          help_entry_id: string
          id: string
          marked_by: string
          society_id: string
        }
        Insert: {
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          date?: string
          help_entry_id: string
          id?: string
          marked_by: string
          society_id: string
        }
        Update: {
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          date?: string
          help_entry_id?: string
          id?: string
          marked_by?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domestic_help_attendance_help_entry_id_fkey"
            columns: ["help_entry_id"]
            isOneToOne: false
            referencedRelation: "domestic_help_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domestic_help_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domestic_help_attendance_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      domestic_help_entries: {
        Row: {
          created_at: string
          flat_number: string | null
          help_name: string
          help_phone: string | null
          help_type: string
          id: string
          is_active: boolean
          photo_url: string | null
          resident_id: string
          society_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          flat_number?: string | null
          help_name: string
          help_phone?: string | null
          help_type?: string
          id?: string
          is_active?: boolean
          photo_url?: string | null
          resident_id: string
          society_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          flat_number?: string | null
          help_name?: string
          help_phone?: string | null
          help_type?: string
          id?: string
          is_active?: boolean
          photo_url?: string | null
          resident_id?: string
          society_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "domestic_help_entries_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domestic_help_entries_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_broadcasts: {
        Row: {
          acknowledged_count: number | null
          created_at: string
          id: string
          is_active: boolean
          message: string
          resolved_at: string | null
          sender_id: string
          sent_by: string | null
          society_id: string
          title: string
          type: string
        }
        Insert: {
          acknowledged_count?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          message: string
          resolved_at?: string | null
          sender_id: string
          sent_by?: string | null
          society_id: string
          title: string
          type?: string
        }
        Update: {
          acknowledged_count?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string
          resolved_at?: string | null
          sender_id?: string
          sent_by?: string | null
          society_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_broadcasts_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_flags: {
        Row: {
          created_at: string
          expense_id: string
          flagged_by: string
          id: string
          reason: string
          status: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          flagged_by: string
          id?: string
          reason: string
          status?: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          flagged_by?: string
          id?: string
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_flags_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "society_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_views: {
        Row: {
          expense_id: string
          id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          expense_id: string
          id?: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          expense_id?: string
          id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_views_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "society_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string | null
          id: string
          seller_id: string
          society_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          seller_id: string
          society_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          seller_id?: string
          society_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_package_items: {
        Row: {
          config_override: Json | null
          created_at: string
          feature_id: string
          id: string
          package_id: string
        }
        Insert: {
          config_override?: Json | null
          created_at?: string
          feature_id: string
          id?: string
          package_id: string
        }
        Update: {
          config_override?: Json | null
          created_at?: string
          feature_id?: string
          id?: string
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_package_items_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "platform_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "feature_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      featured_items: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          reference_id: string
          society_id: string | null
          target_society_ids: string[] | null
          title: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          reference_id: string
          society_id?: string | null
          target_society_ids?: string[] | null
          title?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          reference_id?: string
          society_id?: string | null
          target_society_ids?: string[] | null
          title?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "featured_items_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_entries: {
        Row: {
          awaiting_confirmation: boolean
          confirmation_denied_at: string | null
          confirmation_expires_at: string | null
          confirmed_by_resident_at: string | null
          created_at: string
          entry_time: string
          entry_type: string
          exit_time: string | null
          flat_number: string | null
          guard_id: string | null
          id: string
          notes: string | null
          photo_url: string | null
          purpose: string | null
          society_id: string
          status: string
          updated_at: string
          user_id: string | null
          vehicle_number: string | null
          verified_by: string | null
          visitor_entry_id: string | null
          visitor_name: string
          visitor_phone: string | null
        }
        Insert: {
          awaiting_confirmation?: boolean
          confirmation_denied_at?: string | null
          confirmation_expires_at?: string | null
          confirmed_by_resident_at?: string | null
          created_at?: string
          entry_time?: string
          entry_type?: string
          exit_time?: string | null
          flat_number?: string | null
          guard_id?: string | null
          id?: string
          notes?: string | null
          photo_url?: string | null
          purpose?: string | null
          society_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
          vehicle_number?: string | null
          verified_by?: string | null
          visitor_entry_id?: string | null
          visitor_name: string
          visitor_phone?: string | null
        }
        Update: {
          awaiting_confirmation?: boolean
          confirmation_denied_at?: string | null
          confirmation_expires_at?: string | null
          confirmed_by_resident_at?: string | null
          created_at?: string
          entry_time?: string
          entry_type?: string
          exit_time?: string | null
          flat_number?: string | null
          guard_id?: string | null
          id?: string
          notes?: string | null
          photo_url?: string | null
          purpose?: string | null
          society_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          vehicle_number?: string | null
          verified_by?: string | null
          visitor_entry_id?: string | null
          visitor_name?: string
          visitor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_entries_guard_id_fkey"
            columns: ["guard_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_entries_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_entries_visitor_entry_id_fkey"
            columns: ["visitor_entry_id"]
            isOneToOne: false
            referencedRelation: "visitor_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      help_requests: {
        Row: {
          category: string
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          requester_id: string
          response_count: number | null
          society_id: string
          status: string
          title: string
          updated_at: string
          urgency: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          requester_id: string
          response_count?: number | null
          society_id: string
          status?: string
          title: string
          updated_at?: string
          urgency?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          requester_id?: string
          response_count?: number | null
          society_id?: string
          status?: string
          title?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_requests_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      help_responses: {
        Row: {
          created_at: string
          id: string
          is_accepted: boolean | null
          message: string
          request_id: string
          responder_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_accepted?: boolean | null
          message: string
          request_id: string
          responder_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_accepted?: boolean | null
          message?: string
          request_id?: string
          responder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_checklists: {
        Row: {
          builder_acknowledged_at: string | null
          created_at: string
          failed_items: number
          flat_number: string
          id: string
          inspection_date: string | null
          notes: string | null
          overall_score: number | null
          passed_items: number
          resident_id: string
          society_id: string
          status: string
          submitted_at: string | null
          total_items: number
          tower_id: string | null
          updated_at: string
        }
        Insert: {
          builder_acknowledged_at?: string | null
          created_at?: string
          failed_items?: number
          flat_number: string
          id?: string
          inspection_date?: string | null
          notes?: string | null
          overall_score?: number | null
          passed_items?: number
          resident_id: string
          society_id: string
          status?: string
          submitted_at?: string | null
          total_items?: number
          tower_id?: string | null
          updated_at?: string
        }
        Update: {
          builder_acknowledged_at?: string | null
          created_at?: string
          failed_items?: number
          flat_number?: string
          id?: string
          inspection_date?: string | null
          notes?: string | null
          overall_score?: number | null
          passed_items?: number
          resident_id?: string
          society_id?: string
          status?: string
          submitted_at?: string | null
          total_items?: number
          tower_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_checklists_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_checklists_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_checklists_tower_id_fkey"
            columns: ["tower_id"]
            isOneToOne: false
            referencedRelation: "project_towers"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_items: {
        Row: {
          category: string
          checklist_id: string
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          item_name: string
          notes: string | null
          photo_urls: string[] | null
          severity: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          checklist_id: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          item_name: string
          notes?: string | null
          photo_urls?: string[] | null
          severity?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          checklist_id?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          item_name?: string
          notes?: string | null
          photo_urls?: string[] | null
          severity?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "inspection_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      job_tts_cache: {
        Row: {
          audio_url: string
          generated_at: string
          id: string
          job_request_id: string
          language: string
        }
        Insert: {
          audio_url: string
          generated_at?: string
          id?: string
          job_request_id: string
          language?: string
        }
        Update: {
          audio_url?: string
          generated_at?: string
          id?: string
          job_request_id?: string
          language?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_tts_cache_job_request_id_fkey"
            columns: ["job_request_id"]
            isOneToOne: false
            referencedRelation: "worker_job_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_type_workflow_map: {
        Row: {
          buyer_actions: Json | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          listing_type: string
          seller_actions: Json | null
          status_flow: string[]
          workflow_key: string
        }
        Insert: {
          buyer_actions?: Json | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          listing_type: string
          seller_actions?: Json | null
          status_flow?: string[]
          workflow_key: string
        }
        Update: {
          buyer_actions?: Json | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          listing_type?: string
          seller_actions?: Json | null
          status_flow?: string[]
          workflow_key?: string
        }
        Relationships: []
      }
      live_activity_tokens: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          order_id: string
          platform: string
          push_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          order_id: string
          platform?: string
          push_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          order_id?: string
          platform?: string
          push_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_activity_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_dues: {
        Row: {
          amount: number
          block: string | null
          created_at: string
          due_date: string
          id: string
          late_fee: number | null
          month: string | null
          month_year: string
          paid_date: string | null
          payment_reference: string | null
          payment_status: string
          resident_id: string | null
          society_id: string
          unit_number: string
          updated_at: string
        }
        Insert: {
          amount: number
          block?: string | null
          created_at?: string
          due_date: string
          id?: string
          late_fee?: number | null
          month?: string | null
          month_year: string
          paid_date?: string | null
          payment_reference?: string | null
          payment_status?: string
          resident_id?: string | null
          society_id: string
          unit_number: string
          updated_at?: string
        }
        Update: {
          amount?: number
          block?: string | null
          created_at?: string
          due_date?: string
          id?: string
          late_fee?: number | null
          month?: string | null
          month_year?: string
          paid_date?: string | null
          payment_reference?: string | null
          payment_status?: string
          resident_id?: string | null
          society_id?: string
          unit_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_dues_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_entry_requests: {
        Row: {
          created_at: string
          flat_number: string
          guard_id: string
          id: string
          photo_url: string | null
          purpose: string | null
          responded_at: string | null
          responded_by: string | null
          society_id: string
          status: string
          visitor_name: string
          visitor_phone: string | null
        }
        Insert: {
          created_at?: string
          flat_number: string
          guard_id: string
          id?: string
          photo_url?: string | null
          purpose?: string | null
          responded_at?: string | null
          responded_by?: string | null
          society_id: string
          status?: string
          visitor_name: string
          visitor_phone?: string | null
        }
        Update: {
          created_at?: string
          flat_number?: string
          guard_id?: string
          id?: string
          photo_url?: string | null
          purpose?: string | null
          responded_at?: string | null
          responded_by?: string | null
          society_id?: string
          status?: string
          visitor_name?: string
          visitor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_entry_requests_guard_id_fkey"
            columns: ["guard_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_entry_requests_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_entry_requests_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_events: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          metadata: Json | null
          society_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json | null
          society_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          society_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_events_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_reactions: {
        Row: {
          created_at: string
          id: string
          milestone_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          milestone_id: string
          reaction_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          milestone_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_reactions_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "construction_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          chat: boolean
          created_at: string
          id: string
          orders: boolean
          promotions: boolean
          sounds: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          chat?: boolean
          created_at?: string
          id?: string
          orders?: boolean
          promotions?: boolean
          sounds?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          chat?: boolean
          created_at?: string
          id?: string
          orders?: boolean
          promotions?: boolean
          sounds?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          body: string
          created_at: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          payload: Json | null
          processed_at: string | null
          reference_path: string | null
          retry_count: number
          status: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          processed_at?: string | null
          reference_path?: string | null
          retry_count?: number
          status?: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          processed_at?: string | null
          reference_path?: string | null
          retry_count?: number
          status?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          status: string | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          status?: string | null
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          status?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_otp_codes: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_used: boolean
          order_id: string
          otp_code: string
          purpose: string
          target_status: string | null
          used_at: string | null
          verified: boolean
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_used?: boolean
          order_id: string
          otp_code: string
          purpose?: string
          target_status?: string | null
          used_at?: string | null
          verified?: boolean
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          order_id?: string
          otp_code?: string
          purpose?: string
          target_status?: string | null
          used_at?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "order_otp_codes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_config: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          status_key: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          status_key: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          status_key?: string
        }
        Relationships: []
      }
      order_suggestions: {
        Row: {
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          is_dismissed: boolean
          metadata: Json | null
          product_ids: string[] | null
          seller_id: string | null
          society_id: string | null
          suggestion_type: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_dismissed?: boolean
          metadata?: Json | null
          product_ids?: string[] | null
          seller_id?: string | null
          society_id?: string | null
          suggestion_type?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_dismissed?: boolean
          metadata?: Json | null
          product_ids?: string[] | null
          seller_id?: string | null
          society_id?: string | null
          suggestion_type?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_suggestions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_suggestions_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          actual_delivery_time: string | null
          auto_cancel_at: string | null
          auto_complete_at: string | null
          buyer_confirmed_at: string | null
          buyer_id: string | null
          buyer_society_id: string | null
          coupon_discount: number | null
          coupon_id: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_address_id: string | null
          delivery_fee: number | null
          delivery_handled_by: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          deposit_paid: boolean | null
          deposit_refunded: boolean | null
          discount_amount: number | null
          distance_km: number | null
          estimated_delivery_at: string | null
          estimated_delivery_time: string | null
          failure_owner: string | null
          frozen_total: number | null
          fulfillment_type: string
          id: string
          idempotency_key: string | null
          is_cross_society: boolean
          needs_attention: boolean | null
          needs_attention_reason: string | null
          net_amount: number | null
          notes: string | null
          notify_buyer: boolean | null
          notify_seller: boolean | null
          order_type: string | null
          otp_code: string | null
          otp_verified: boolean | null
          packaging_fee: number | null
          payment_confirmed_at: string | null
          payment_mode: string | null
          payment_status: string | null
          payment_type: string | null
          price_stable_since: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          ready_at: string | null
          rejection_reason: string | null
          rental_end_date: string | null
          rental_start_date: string | null
          scheduled_date: string | null
          scheduled_delivery_time: string | null
          scheduled_time_end: string | null
          scheduled_time_start: string | null
          seller_id: string | null
          seller_society_id: string | null
          society_id: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          status_updated_at: string | null
          subtotal: number | null
          total_amount: number
          transaction_type: string | null
          updated_at: string | null
        }
        Insert: {
          actual_delivery_time?: string | null
          auto_cancel_at?: string | null
          auto_complete_at?: string | null
          buyer_confirmed_at?: string | null
          buyer_id?: string | null
          buyer_society_id?: string | null
          coupon_discount?: number | null
          coupon_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_address_id?: string | null
          delivery_fee?: number | null
          delivery_handled_by?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          deposit_paid?: boolean | null
          deposit_refunded?: boolean | null
          discount_amount?: number | null
          distance_km?: number | null
          estimated_delivery_at?: string | null
          estimated_delivery_time?: string | null
          failure_owner?: string | null
          frozen_total?: number | null
          fulfillment_type?: string
          id?: string
          idempotency_key?: string | null
          is_cross_society?: boolean
          needs_attention?: boolean | null
          needs_attention_reason?: string | null
          net_amount?: number | null
          notes?: string | null
          notify_buyer?: boolean | null
          notify_seller?: boolean | null
          order_type?: string | null
          otp_code?: string | null
          otp_verified?: boolean | null
          packaging_fee?: number | null
          payment_confirmed_at?: string | null
          payment_mode?: string | null
          payment_status?: string | null
          payment_type?: string | null
          price_stable_since?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          ready_at?: string | null
          rejection_reason?: string | null
          rental_end_date?: string | null
          rental_start_date?: string | null
          scheduled_date?: string | null
          scheduled_delivery_time?: string | null
          scheduled_time_end?: string | null
          scheduled_time_start?: string | null
          seller_id?: string | null
          seller_society_id?: string | null
          society_id?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          status_updated_at?: string | null
          subtotal?: number | null
          total_amount: number
          transaction_type?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_delivery_time?: string | null
          auto_cancel_at?: string | null
          auto_complete_at?: string | null
          buyer_confirmed_at?: string | null
          buyer_id?: string | null
          buyer_society_id?: string | null
          coupon_discount?: number | null
          coupon_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_address_id?: string | null
          delivery_fee?: number | null
          delivery_handled_by?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          deposit_paid?: boolean | null
          deposit_refunded?: boolean | null
          discount_amount?: number | null
          distance_km?: number | null
          estimated_delivery_at?: string | null
          estimated_delivery_time?: string | null
          failure_owner?: string | null
          frozen_total?: number | null
          fulfillment_type?: string
          id?: string
          idempotency_key?: string | null
          is_cross_society?: boolean
          needs_attention?: boolean | null
          needs_attention_reason?: string | null
          net_amount?: number | null
          notes?: string | null
          notify_buyer?: boolean | null
          notify_seller?: boolean | null
          order_type?: string | null
          otp_code?: string | null
          otp_verified?: boolean | null
          packaging_fee?: number | null
          payment_confirmed_at?: string | null
          payment_mode?: string | null
          payment_status?: string | null
          payment_type?: string | null
          price_stable_since?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          ready_at?: string | null
          rejection_reason?: string | null
          rental_end_date?: string | null
          rental_start_date?: string | null
          scheduled_date?: string | null
          scheduled_delivery_time?: string | null
          scheduled_time_end?: string | null
          scheduled_time_start?: string | null
          seller_id?: string | null
          seller_society_id?: string | null
          society_id?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          status_updated_at?: string | null
          subtotal?: number | null
          total_amount?: number
          transaction_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_society_id_fkey"
            columns: ["buyer_society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_society_id_fkey"
            columns: ["seller_society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      orders_archive: {
        Row: {
          archived_at: string
          auto_cancel_at: string | null
          buyer_id: string | null
          coupon_id: string | null
          created_at: string | null
          delivery_address: string | null
          deposit_paid: boolean | null
          deposit_refunded: boolean | null
          discount_amount: number | null
          id: string
          notes: string | null
          order_type: string | null
          payment_status: string | null
          payment_type: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          rejection_reason: string | null
          rental_end_date: string | null
          rental_start_date: string | null
          scheduled_date: string | null
          scheduled_time_end: string | null
          scheduled_time_start: string | null
          seller_id: string | null
          society_id: string | null
          status: string | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          archived_at?: string
          auto_cancel_at?: string | null
          buyer_id?: string | null
          coupon_id?: string | null
          created_at?: string | null
          delivery_address?: string | null
          deposit_paid?: boolean | null
          deposit_refunded?: boolean | null
          discount_amount?: number | null
          id: string
          notes?: string | null
          order_type?: string | null
          payment_status?: string | null
          payment_type?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          rejection_reason?: string | null
          rental_end_date?: string | null
          rental_start_date?: string | null
          scheduled_date?: string | null
          scheduled_time_end?: string | null
          scheduled_time_start?: string | null
          seller_id?: string | null
          society_id?: string | null
          status?: string | null
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          archived_at?: string
          auto_cancel_at?: string | null
          buyer_id?: string | null
          coupon_id?: string | null
          created_at?: string | null
          delivery_address?: string | null
          deposit_paid?: boolean | null
          deposit_refunded?: boolean | null
          discount_amount?: number | null
          id?: string
          notes?: string | null
          order_type?: string | null
          payment_status?: string | null
          payment_type?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          rejection_reason?: string | null
          rental_end_date?: string | null
          rental_start_date?: string | null
          scheduled_date?: string | null
          scheduled_time_end?: string | null
          scheduled_time_start?: string | null
          seller_id?: string | null
          society_id?: string | null
          status?: string | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      parcel_entries: {
        Row: {
          collected_at: string | null
          collected_by: string | null
          courier_name: string | null
          created_at: string
          description: string | null
          flat_number: string | null
          gate_entry_id: string | null
          id: string
          photo_url: string | null
          received_at: string
          resident_id: string
          society_id: string
          status: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          collected_at?: string | null
          collected_by?: string | null
          courier_name?: string | null
          created_at?: string
          description?: string | null
          flat_number?: string | null
          gate_entry_id?: string | null
          id?: string
          photo_url?: string | null
          received_at?: string
          resident_id: string
          society_id: string
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          collected_at?: string | null
          collected_by?: string | null
          courier_name?: string | null
          created_at?: string
          description?: string | null
          flat_number?: string | null
          gate_entry_id?: string | null
          id?: string
          photo_url?: string | null
          received_at?: string
          resident_id?: string
          society_id?: string
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcel_entries_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_entries_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_groups: {
        Row: {
          color: string
          created_at: string
          description: string
          icon: string
          id: string
          is_active: boolean
          license_description: string | null
          license_mandatory: boolean
          license_type_name: string | null
          name: string
          requires_license: boolean
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          license_description?: string | null
          license_mandatory?: boolean
          license_type_name?: string | null
          name: string
          requires_license?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          license_description?: string | null
          license_mandatory?: boolean
          license_type_name?: string | null
          name?: string
          requires_license?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      parking_slots: {
        Row: {
          created_at: string
          id: string
          is_assigned: boolean
          is_visitor_slot: boolean
          slot_number: string
          slot_type: string
          society_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_assigned?: boolean
          is_visitor_slot?: boolean
          slot_number: string
          slot_type?: string
          society_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_assigned?: boolean
          is_visitor_slot?: boolean
          slot_number?: string
          slot_type?: string
          society_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parking_slots_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      parking_violations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          notes: string | null
          parking_slot_id: string | null
          photo_url: string | null
          reported_by: string
          resolved_at: string | null
          society_id: string
          status: string
          updated_at: string
          vehicle_number: string | null
          violation_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          parking_slot_id?: string | null
          photo_url?: string | null
          reported_by: string
          resolved_at?: string | null
          society_id: string
          status?: string
          updated_at?: string
          vehicle_number?: string | null
          violation_type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          parking_slot_id?: string | null
          photo_url?: string | null
          reported_by?: string
          resolved_at?: string | null
          society_id?: string
          status?: string
          updated_at?: string
          vehicle_number?: string | null
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "parking_violations_parking_slot_id_fkey"
            columns: ["parking_slot_id"]
            isOneToOne: false
            referencedRelation: "parking_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parking_violations_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parking_violations_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestones: {
        Row: {
          amount_percentage: number
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          linked_milestone_id: string | null
          milestone_stage: string
          society_id: string
          status: string
          title: string
          tower_id: string | null
          updated_at: string
        }
        Insert: {
          amount_percentage?: number
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          linked_milestone_id?: string | null
          milestone_stage?: string
          society_id: string
          status?: string
          title: string
          tower_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_percentage?: number
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          linked_milestone_id?: string | null
          milestone_stage?: string
          society_id?: string
          status?: string
          title?: string
          tower_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_linked_milestone_id_fkey"
            columns: ["linked_milestone_id"]
            isOneToOne: false
            referencedRelation: "construction_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_tower_id_fkey"
            columns: ["tower_id"]
            isOneToOne: false
            referencedRelation: "project_towers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount: number
          buyer_id: string
          created_at: string | null
          id: string
          idempotency_key: string | null
          net_amount: number | null
          order_id: string
          payment_method: string
          payment_status: string
          platform_fee: number | null
          seller_id: string | null
          transaction_id: string | null
          transaction_reference: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          buyer_id: string
          created_at?: string | null
          id?: string
          idempotency_key?: string | null
          net_amount?: number | null
          order_id: string
          payment_method?: string
          payment_status?: string
          platform_fee?: number | null
          seller_id?: string | null
          transaction_id?: string | null
          transaction_reference?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          buyer_id?: string
          created_at?: string | null
          id?: string
          idempotency_key?: string | null
          net_amount?: number | null
          order_id?: string
          payment_method?: string
          payment_status?: string
          platform_fee?: number | null
          seller_id?: string | null
          transaction_id?: string | null
          transaction_reference?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlements: {
        Row: {
          amount: number
          created_at: string
          id: string
          period_end: string | null
          period_start: string | null
          seller_id: string
          settled_at: string | null
          society_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          seller_id: string
          settled_at?: string | null
          society_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          seller_id?: string
          settled_at?: string | null
          society_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlements_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_otp_verifications: {
        Row: {
          attempt_count: number
          created_at: string
          expires_at: string
          id: string
          max_attempts: number
          otp_hash: string
          phone_number: string
          status: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          expires_at: string
          id?: string
          max_attempts?: number
          otp_hash: string
          phone_number: string
          status?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          otp_hash?: string
          phone_number?: string
          status?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      platform_features: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          display_name: string
          feature_key: string
          feature_name: string | null
          id: string
          is_active: boolean
          is_core: boolean
          is_global: boolean
          requires_society: boolean
          society_configurable: boolean
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          feature_key: string
          feature_name?: string | null
          id?: string
          is_active?: boolean
          is_core?: boolean
          is_global?: boolean
          requires_society?: boolean
          society_configurable?: boolean
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          feature_key?: string
          feature_name?: string | null
          id?: string
          is_active?: boolean
          is_core?: boolean
          is_global?: boolean
          requires_society?: boolean
          society_configurable?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_price: number
          old_price: number
          product_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_price: number
          old_price: number
          product_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_price?: number
          old_price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_edit_snapshots: {
        Row: {
          created_at: string
          id: string
          product_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "product_edit_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          accepts_preorders: boolean | null
          action_type: string
          approval_status: string
          attribute_blocks: Json | null
          available_slots: Json | null
          brand: string | null
          bullet_features: string[] | null
          category: string
          condition: string | null
          contact_phone: string | null
          created_at: string | null
          deposit_amount: number | null
          description: string | null
          dietary_tags: string[] | null
          discount_percentage: number | null
          id: string
          image_url: string | null
          ingredients: string | null
          is_available: boolean | null
          is_bestseller: boolean | null
          is_negotiable: boolean | null
          is_recommended: boolean | null
          is_urgent: boolean | null
          is_veg: boolean | null
          lead_time_hours: number | null
          listing_type: string | null
          location_required: boolean | null
          low_stock_threshold: number | null
          max_rental_duration: number | null
          min_rental_duration: number | null
          mrp: number | null
          name: string
          packaging_type: string | null
          preorder_cutoff_time: string | null
          prep_time_minutes: number | null
          price: number
          price_per_unit: string | null
          price_stable_since: string | null
          product_hints: string[] | null
          rejection_note: string | null
          rental_period_type: string | null
          search_vector: unknown
          secondary_images: string[] | null
          seller_id: string
          service_duration_minutes: number | null
          serving_size: string | null
          specifications: Json | null
          spice_level: string | null
          stock_quantity: number | null
          subcategory_id: string | null
          unit_type: string | null
          updated_at: string | null
        }
        Insert: {
          accepts_preorders?: boolean | null
          action_type?: string
          approval_status?: string
          attribute_blocks?: Json | null
          available_slots?: Json | null
          brand?: string | null
          bullet_features?: string[] | null
          category: string
          condition?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deposit_amount?: number | null
          description?: string | null
          dietary_tags?: string[] | null
          discount_percentage?: number | null
          id?: string
          image_url?: string | null
          ingredients?: string | null
          is_available?: boolean | null
          is_bestseller?: boolean | null
          is_negotiable?: boolean | null
          is_recommended?: boolean | null
          is_urgent?: boolean | null
          is_veg?: boolean | null
          lead_time_hours?: number | null
          listing_type?: string | null
          location_required?: boolean | null
          low_stock_threshold?: number | null
          max_rental_duration?: number | null
          min_rental_duration?: number | null
          mrp?: number | null
          name: string
          packaging_type?: string | null
          preorder_cutoff_time?: string | null
          prep_time_minutes?: number | null
          price: number
          price_per_unit?: string | null
          price_stable_since?: string | null
          product_hints?: string[] | null
          rejection_note?: string | null
          rental_period_type?: string | null
          search_vector?: unknown
          secondary_images?: string[] | null
          seller_id: string
          service_duration_minutes?: number | null
          serving_size?: string | null
          specifications?: Json | null
          spice_level?: string | null
          stock_quantity?: number | null
          subcategory_id?: string | null
          unit_type?: string | null
          updated_at?: string | null
        }
        Update: {
          accepts_preorders?: boolean | null
          action_type?: string
          approval_status?: string
          attribute_blocks?: Json | null
          available_slots?: Json | null
          brand?: string | null
          bullet_features?: string[] | null
          category?: string
          condition?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deposit_amount?: number | null
          description?: string | null
          dietary_tags?: string[] | null
          discount_percentage?: number | null
          id?: string
          image_url?: string | null
          ingredients?: string | null
          is_available?: boolean | null
          is_bestseller?: boolean | null
          is_negotiable?: boolean | null
          is_recommended?: boolean | null
          is_urgent?: boolean | null
          is_veg?: boolean | null
          lead_time_hours?: number | null
          listing_type?: string | null
          location_required?: boolean | null
          low_stock_threshold?: number | null
          max_rental_duration?: number | null
          min_rental_duration?: number | null
          mrp?: number | null
          name?: string
          packaging_type?: string | null
          preorder_cutoff_time?: string | null
          prep_time_minutes?: number | null
          price?: number
          price_per_unit?: string | null
          price_stable_since?: string | null
          product_hints?: string[] | null
          rejection_note?: string | null
          rental_period_type?: string | null
          search_vector?: unknown
          secondary_images?: string[] | null
          seller_id?: string
          service_duration_minutes?: number | null
          serving_size?: string | null
          specifications?: Json | null
          spice_level?: string | null
          stock_quantity?: number | null
          subcategory_id?: string | null
          unit_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          block: string
          browse_beyond_community: boolean
          created_at: string | null
          email: string | null
          flat_number: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          phase: string | null
          phone: string
          search_radius_km: number
          society_id: string | null
          updated_at: string | null
          verification_status: string | null
        }
        Insert: {
          avatar_url?: string | null
          block: string
          browse_beyond_community?: boolean
          created_at?: string | null
          email?: string | null
          flat_number: string
          id: string
          latitude?: number | null
          longitude?: number | null
          name: string
          phase?: string | null
          phone: string
          search_radius_km?: number
          society_id?: string | null
          updated_at?: string | null
          verification_status?: string | null
        }
        Update: {
          avatar_url?: string | null
          block?: string
          browse_beyond_community?: boolean
          created_at?: string | null
          email?: string | null
          flat_number?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          phase?: string | null
          phone?: string
          search_radius_km?: number
          society_id?: string | null
          updated_at?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_answers: {
        Row: {
          answer: string
          answered_by: string
          created_at: string
          id: string
          is_official: boolean | null
          question_id: string
        }
        Insert: {
          answer: string
          answered_by: string
          created_at?: string
          id?: string
          is_official?: boolean | null
          question_id: string
        }
        Update: {
          answer?: string
          answered_by?: string
          created_at?: string
          id?: string
          is_official?: boolean | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "project_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          category: string
          created_at: string
          document_url: string
          id: string
          society_id: string
          title: string
          uploaded_by: string
        }
        Insert: {
          category?: string
          created_at?: string
          document_url: string
          id?: string
          society_id: string
          title: string
          uploaded_by: string
        }
        Update: {
          category?: string
          created_at?: string
          document_url?: string
          id?: string
          society_id?: string
          title?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_questions: {
        Row: {
          asked_by: string
          category: string | null
          created_at: string
          id: string
          is_anonymous: boolean | null
          question: string
          question_text: string | null
          society_id: string
          updated_at: string
          upvote_count: number | null
        }
        Insert: {
          asked_by: string
          category?: string | null
          created_at?: string
          id?: string
          is_anonymous?: boolean | null
          question: string
          question_text?: string | null
          society_id: string
          updated_at?: string
          upvote_count?: number | null
        }
        Update: {
          asked_by?: string
          category?: string | null
          created_at?: string
          id?: string
          is_anonymous?: boolean | null
          question?: string
          question_text?: string | null
          society_id?: string
          updated_at?: string
          upvote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_questions_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_towers: {
        Row: {
          created_at: string
          expected_completion: string | null
          id: string
          name: string
          society_id: string
          status: string
          total_floors: number | null
          total_units: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_completion?: string | null
          id?: string
          name: string
          society_id: string
          status?: string
          total_floors?: number | null
          total_units?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_completion?: string | null
          id?: string
          name?: string
          society_id?: string
          status?: string
          total_floors?: number | null
          total_units?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_towers_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      push_logs: {
        Row: {
          apns_id: string | null
          body: string | null
          created_at: string
          error: string | null
          id: string
          payload: Json | null
          platform: string
          status: string
          title: string
          token: string
          user_id: string
        }
        Insert: {
          apns_id?: string | null
          body?: string | null
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          platform?: string
          status?: string
          title: string
          token: string
          user_id: string
        }
        Update: {
          apns_id?: string | null
          body?: string | null
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          platform?: string
          status?: string
          title?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          id: string
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          id?: string
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          id?: string
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          description: string | null
          id: string
          report_type: string
          reported_seller_id: string | null
          reported_user_id: string | null
          reporter_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          report_type: string
          reported_seller_id?: string | null
          reported_user_id?: string | null
          reporter_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          report_type?: string
          reported_seller_id?: string | null
          reported_user_id?: string | null
          reporter_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          milestone_id: string
          notes: string | null
          paid_at: string | null
          payment_status: string
          receipt_url: string | null
          resident_id: string
          society_id: string
          transaction_reference: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          milestone_id: string
          notes?: string | null
          paid_at?: string | null
          payment_status?: string
          receipt_url?: string | null
          resident_id: string
          society_id: string
          transaction_reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          milestone_id?: string
          notes?: string | null
          paid_at?: string | null
          payment_status?: string
          receipt_url?: string | null
          resident_id?: string
          society_id?: string
          transaction_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_payments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_payments_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_payments_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          buyer_id: string | null
          comment: string | null
          created_at: string | null
          hidden_reason: string | null
          id: string
          is_hidden: boolean | null
          order_id: string
          rating: number
          seller_id: string
          society_id: string | null
        }
        Insert: {
          buyer_id?: string | null
          comment?: string | null
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean | null
          order_id: string
          rating: number
          seller_id: string
          society_id?: string | null
        }
        Update: {
          buyer_id?: string | null
          comment?: string | null
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean | null
          order_id?: string
          rating?: number
          seller_id?: string
          society_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_demand_log: {
        Row: {
          id: string
          results_count: number | null
          search_term: string
          searched_at: string
          society_id: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          results_count?: number | null
          search_term: string
          searched_at?: string
          society_id?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          results_count?: number | null
          search_term?: string
          searched_at?: string
          society_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_demand_log_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      security_staff: {
        Row: {
          created_at: string
          deactivated_at: string | null
          gate_assignment: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: string
          shift: string | null
          society_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          gate_assignment?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          shift?: string | null
          society_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          gate_assignment?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          shift?: string | null
          society_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_staff_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_contact_interactions: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          interaction_type: string
          product_id: string | null
          seller_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          interaction_type?: string
          product_id?: string | null
          seller_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          interaction_type?: string
          product_id?: string | null
          seller_id?: string
        }
        Relationships: []
      }
      seller_conversation_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          message_text: string
          sender_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message_text: string
          sender_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message_text?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "seller_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_conversations: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          last_message_at: string | null
          product_id: string | null
          seller_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          product_id?: string | null
          seller_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          product_id?: string | null
          seller_id?: string
        }
        Relationships: []
      }
      seller_form_configs: {
        Row: {
          category: string
          created_at: string
          form_schema: Json
          id: string
          is_active: boolean
          society_id: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          form_schema?: Json
          id?: string
          is_active?: boolean
          society_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          form_schema?: Json
          id?: string
          is_active?: boolean
          society_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_form_configs_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_licenses: {
        Row: {
          created_at: string
          document_url: string | null
          expires_at: string | null
          id: string
          license_number: string
          license_type: string
          seller_id: string
          updated_at: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          document_url?: string | null
          expires_at?: string | null
          id?: string
          license_number: string
          license_type: string
          seller_id: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          document_url?: string | null
          expires_at?: string | null
          id?: string
          license_number?: string
          license_type?: string
          seller_id?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_licenses_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_profiles: {
        Row: {
          accepts_cod: boolean | null
          accepts_upi: boolean | null
          attribute_blocks: Json | null
          availability_end: string | null
          availability_start: string | null
          avg_preparation_time: number | null
          avg_response_minutes: number | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_ifsc_code: string | null
          business_name: string
          cancellation_policy: string | null
          cancellation_rate: number | null
          categories: string[]
          completed_order_count: number | null
          cover_image_url: string | null
          created_at: string | null
          daily_order_limit: number | null
          delivery_fee: number | null
          delivery_handled_by: string | null
          delivery_instructions: string | null
          delivery_note: string | null
          delivery_payment_config: Json | null
          delivery_radius_km: number
          description: string | null
          food_license_reviewed_at: string | null
          food_license_status: string | null
          food_license_submitted_at: string | null
          food_license_url: string | null
          fssai_number: string | null
          fulfillment_mode: string
          id: string
          is_available: boolean | null
          is_featured: boolean | null
          last_active_at: string | null
          latitude: number | null
          longitude: number | null
          manual_override: string | null
          manual_override_until: string | null
          min_order_amount: number | null
          minimum_order_amount: number | null
          operating_days: string[] | null
          otp_required: boolean | null
          packaging_fee: number | null
          payment_collection: string | null
          pickup_payment_config: Json | null
          primary_group: string | null
          profile_image_url: string | null
          rating: number | null
          razorpay_account_id: string | null
          razorpay_onboarding_status: string | null
          rejection_note: string | null
          search_radius_km: number | null
          sell_beyond_community: boolean
          seller_type: Database["public"]["Enums"]["seller_type_enum"]
          service_radius_km: number | null
          society_id: string | null
          store_location_source: string | null
          subcategory_preferences: Json | null
          total_reviews: number | null
          updated_at: string | null
          upi_id: string | null
          user_id: string
          vacation_mode: boolean | null
          vacation_until: string | null
          verification_status: string | null
        }
        Insert: {
          accepts_cod?: boolean | null
          accepts_upi?: boolean | null
          attribute_blocks?: Json | null
          availability_end?: string | null
          availability_start?: string | null
          avg_preparation_time?: number | null
          avg_response_minutes?: number | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc_code?: string | null
          business_name: string
          cancellation_policy?: string | null
          cancellation_rate?: number | null
          categories?: string[]
          completed_order_count?: number | null
          cover_image_url?: string | null
          created_at?: string | null
          daily_order_limit?: number | null
          delivery_fee?: number | null
          delivery_handled_by?: string | null
          delivery_instructions?: string | null
          delivery_note?: string | null
          delivery_payment_config?: Json | null
          delivery_radius_km?: number
          description?: string | null
          food_license_reviewed_at?: string | null
          food_license_status?: string | null
          food_license_submitted_at?: string | null
          food_license_url?: string | null
          fssai_number?: string | null
          fulfillment_mode?: string
          id?: string
          is_available?: boolean | null
          is_featured?: boolean | null
          last_active_at?: string | null
          latitude?: number | null
          longitude?: number | null
          manual_override?: string | null
          manual_override_until?: string | null
          min_order_amount?: number | null
          minimum_order_amount?: number | null
          operating_days?: string[] | null
          otp_required?: boolean | null
          packaging_fee?: number | null
          payment_collection?: string | null
          pickup_payment_config?: Json | null
          primary_group?: string | null
          profile_image_url?: string | null
          rating?: number | null
          razorpay_account_id?: string | null
          razorpay_onboarding_status?: string | null
          rejection_note?: string | null
          search_radius_km?: number | null
          sell_beyond_community?: boolean
          seller_type?: Database["public"]["Enums"]["seller_type_enum"]
          service_radius_km?: number | null
          society_id?: string | null
          store_location_source?: string | null
          subcategory_preferences?: Json | null
          total_reviews?: number | null
          updated_at?: string | null
          upi_id?: string | null
          user_id: string
          vacation_mode?: boolean | null
          vacation_until?: string | null
          verification_status?: string | null
        }
        Update: {
          accepts_cod?: boolean | null
          accepts_upi?: boolean | null
          attribute_blocks?: Json | null
          availability_end?: string | null
          availability_start?: string | null
          avg_preparation_time?: number | null
          avg_response_minutes?: number | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc_code?: string | null
          business_name?: string
          cancellation_policy?: string | null
          cancellation_rate?: number | null
          categories?: string[]
          completed_order_count?: number | null
          cover_image_url?: string | null
          created_at?: string | null
          daily_order_limit?: number | null
          delivery_fee?: number | null
          delivery_handled_by?: string | null
          delivery_instructions?: string | null
          delivery_note?: string | null
          delivery_payment_config?: Json | null
          delivery_radius_km?: number
          description?: string | null
          food_license_reviewed_at?: string | null
          food_license_status?: string | null
          food_license_submitted_at?: string | null
          food_license_url?: string | null
          fssai_number?: string | null
          fulfillment_mode?: string
          id?: string
          is_available?: boolean | null
          is_featured?: boolean | null
          last_active_at?: string | null
          latitude?: number | null
          longitude?: number | null
          manual_override?: string | null
          manual_override_until?: string | null
          min_order_amount?: number | null
          minimum_order_amount?: number | null
          operating_days?: string[] | null
          otp_required?: boolean | null
          packaging_fee?: number | null
          payment_collection?: string | null
          pickup_payment_config?: Json | null
          primary_group?: string | null
          profile_image_url?: string | null
          rating?: number | null
          razorpay_account_id?: string | null
          razorpay_onboarding_status?: string | null
          rejection_note?: string | null
          search_radius_km?: number | null
          sell_beyond_community?: boolean
          seller_type?: Database["public"]["Enums"]["seller_type_enum"]
          service_radius_km?: number | null
          society_id?: string | null
          store_location_source?: string | null
          subcategory_preferences?: Json | null
          total_reviews?: number | null
          updated_at?: string | null
          upi_id?: string | null
          user_id?: string
          vacation_mode?: boolean | null
          vacation_until?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_profiles_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_recommendations: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          recommender_id: string
          seller_id: string
          society_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          recommender_id: string
          seller_id: string
          society_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          recommender_id?: string
          seller_id?: string
          society_id?: string | null
        }
        Relationships: []
      }
      seller_reputation_ledger: {
        Row: {
          created_at: string
          description: string | null
          event_type: string
          id: string
          metadata: Json | null
          points: number
          seller_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          points?: number
          seller_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          points?: number
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_reputation_ledger_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_settlements: {
        Row: {
          created_at: string
          delivery_fees: number | null
          gross_amount: number | null
          id: string
          net_amount: number | null
          period_end: string
          period_start: string
          platform_fee: number | null
          seller_id: string
          settled_at: string | null
          society_id: string
          status: string
          total_orders: number | null
          transaction_reference: string | null
        }
        Insert: {
          created_at?: string
          delivery_fees?: number | null
          gross_amount?: number | null
          id?: string
          net_amount?: number | null
          period_end: string
          period_start: string
          platform_fee?: number | null
          seller_id: string
          settled_at?: string | null
          society_id: string
          status?: string
          total_orders?: number | null
          transaction_reference?: string | null
        }
        Update: {
          created_at?: string
          delivery_fees?: number | null
          gross_amount?: number | null
          id?: string
          net_amount?: number | null
          period_end?: string
          period_start?: string
          platform_fee?: number | null
          seller_id?: string
          settled_at?: string | null
          society_id?: string
          status?: string
          total_orders?: number | null
          transaction_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_settlements_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_settlements_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      service_addons: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          price: number
          product_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          price?: number
          product_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          product_id?: string
        }
        Relationships: []
      }
      service_availability_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          product_id: string | null
          seller_id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          product_id?: string | null
          seller_id: string
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          product_id?: string | null
          seller_id?: string
          start_time?: string
        }
        Relationships: []
      }
      service_booking_addons: {
        Row: {
          addon_id: string
          addon_name: string
          addon_price: number
          booking_id: string
          created_at: string
          id: string
        }
        Insert: {
          addon_id: string
          addon_name: string
          addon_price?: number
          booking_id: string
          created_at?: string
          id?: string
        }
        Update: {
          addon_id?: string
          addon_name?: string
          addon_price?: number
          booking_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      service_bookings: {
        Row: {
          booking_date: string
          buyer_address: string | null
          buyer_id: string
          created_at: string
          end_time: string
          id: string
          location_type: string | null
          notes: string | null
          order_id: string | null
          product_id: string | null
          seller_id: string
          slot_id: string | null
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_date: string
          buyer_address?: string | null
          buyer_id: string
          created_at?: string
          end_time: string
          id?: string
          location_type?: string | null
          notes?: string | null
          order_id?: string | null
          product_id?: string | null
          seller_id: string
          slot_id?: string | null
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_date?: string
          buyer_address?: string | null
          buyer_id?: string
          created_at?: string
          end_time?: string
          id?: string
          location_type?: string | null
          notes?: string | null
          order_id?: string | null
          product_id?: string | null
          seller_id?: string
          slot_id?: string | null
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_bookings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "service_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      service_listings: {
        Row: {
          buffer_minutes: number
          cancellation_fee_percentage: number
          cancellation_notice_hours: number
          created_at: string
          duration_minutes: number
          id: string
          location_type: string
          max_bookings_per_slot: number
          preparation_instructions: string | null
          price_model: string
          product_id: string
          rescheduling_notice_hours: number
          service_type: string
          updated_at: string
        }
        Insert: {
          buffer_minutes?: number
          cancellation_fee_percentage?: number
          cancellation_notice_hours?: number
          created_at?: string
          duration_minutes?: number
          id?: string
          location_type?: string
          max_bookings_per_slot?: number
          preparation_instructions?: string | null
          price_model?: string
          product_id: string
          rescheduling_notice_hours?: number
          service_type?: string
          updated_at?: string
        }
        Update: {
          buffer_minutes?: number
          cancellation_fee_percentage?: number
          cancellation_notice_hours?: number
          created_at?: string
          duration_minutes?: number
          id?: string
          location_type?: string
          max_bookings_per_slot?: number
          preparation_instructions?: string | null
          price_model?: string
          product_id?: string
          rescheduling_notice_hours?: number
          service_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_recurring_configs: {
        Row: {
          booking_id: string
          buyer_id: string
          created_at: string
          day_of_week: number
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          last_generated_date: string | null
          preferred_time: string
          product_id: string
          seller_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          buyer_id: string
          created_at?: string
          day_of_week: number
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          preferred_time: string
          product_id: string
          seller_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          buyer_id?: string
          created_at?: string
          day_of_week?: number
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          preferred_time?: string
          product_id?: string
          seller_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_slots: {
        Row: {
          booked_count: number
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_blocked: boolean
          max_capacity: number
          product_id: string | null
          seller_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          booked_count?: number
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_blocked?: boolean
          max_capacity?: number
          product_id?: string | null
          seller_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          booked_count?: number
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_blocked?: boolean
          max_capacity?: number
          product_id?: string | null
          seller_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_slots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_slots_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_staff: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          photo_url: string | null
          seller_id: string
          specializations: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          photo_url?: string | null
          seller_id: string
          specializations?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          photo_url?: string | null
          seller_id?: string
          specializations?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      session_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          metadata: Json | null
          rating: number | null
          session_type: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          rating?: number | null
          session_type?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          rating?: number | null
          session_type?: string
          user_id?: string
        }
        Relationships: []
      }
      skill_endorsements: {
        Row: {
          comment: string | null
          created_at: string
          endorser_id: string
          id: string
          rating: number | null
          skill_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          endorser_id: string
          id?: string
          rating?: number | null
          skill_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          endorser_id?: string
          id?: string
          rating?: number | null
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_endorsements_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skill_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_listings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          endorsement_count: number | null
          experience_years: number | null
          hourly_rate: number | null
          id: string
          is_available: boolean
          portfolio_urls: string[] | null
          society_id: string
          title: string
          trust_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          endorsement_count?: number | null
          experience_years?: number | null
          hourly_rate?: number | null
          id?: string
          is_available?: boolean
          portfolio_urls?: string[] | null
          society_id: string
          title: string
          trust_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          endorsement_count?: number | null
          experience_years?: number | null
          hourly_rate?: number | null
          id?: string
          is_available?: boolean
          portfolio_urls?: string[] | null
          society_id?: string
          title?: string
          trust_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_listings_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_holds: {
        Row: {
          created_at: string
          expires_at: string
          held_by: string
          id: string
          product_id: string
          slot_date: string
          slot_time: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          held_by: string
          id?: string
          product_id: string
          slot_date: string
          slot_time: string
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          held_by?: string
          id?: string
          product_id?: string
          slot_date?: string
          slot_time?: string
          status?: string
        }
        Relationships: []
      }
      slot_waitlist: {
        Row: {
          created_at: string
          id: string
          notified_at: string | null
          product_id: string
          slot_date: string
          slot_time: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notified_at?: string | null
          product_id: string
          slot_date: string
          slot_time: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notified_at?: string | null
          product_id?: string
          slot_date?: string
          slot_time?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      snag_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          completion_percentage: number | null
          created_at: string
          description: string
          id: string
          image_urls: string[] | null
          priority: string
          reported_by: string
          resolution_note: string | null
          resolved_at: string | null
          society_id: string
          status: string
          title: string | null
          tower_id: string | null
          unit_number: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          completion_percentage?: number | null
          created_at?: string
          description: string
          id?: string
          image_urls?: string[] | null
          priority?: string
          reported_by: string
          resolution_note?: string | null
          resolved_at?: string | null
          society_id: string
          status?: string
          title?: string | null
          tower_id?: string | null
          unit_number: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          completion_percentage?: number | null
          created_at?: string
          description?: string
          id?: string
          image_urls?: string[] | null
          priority?: string
          reported_by?: string
          resolution_note?: string | null
          resolved_at?: string | null
          society_id?: string
          status?: string
          title?: string | null
          tower_id?: string | null
          unit_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "snag_tickets_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snag_tickets_tower_id_fkey"
            columns: ["tower_id"]
            isOneToOne: false
            referencedRelation: "project_towers"
            referencedColumns: ["id"]
          },
        ]
      }
      societies: {
        Row: {
          address: string | null
          admin_user_id: string | null
          approval_method: string
          auto_approve_residents: boolean
          builder_id: string | null
          city: string | null
          created_at: string
          geofence_radius_meters: number | null
          id: string
          invite_code: string | null
          is_active: boolean | null
          is_under_construction: boolean
          is_verified: boolean | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          max_society_admins: number
          member_count: number | null
          name: string
          pincode: string | null
          rules_text: string | null
          security_confirmation_timeout_seconds: number
          security_mode: string
          slug: string
          state: string | null
          trust_score: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_user_id?: string | null
          approval_method?: string
          auto_approve_residents?: boolean
          builder_id?: string | null
          city?: string | null
          created_at?: string
          geofence_radius_meters?: number | null
          id?: string
          invite_code?: string | null
          is_active?: boolean | null
          is_under_construction?: boolean
          is_verified?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_society_admins?: number
          member_count?: number | null
          name: string
          pincode?: string | null
          rules_text?: string | null
          security_confirmation_timeout_seconds?: number
          security_mode?: string
          slug: string
          state?: string | null
          trust_score?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_user_id?: string | null
          approval_method?: string
          auto_approve_residents?: boolean
          builder_id?: string | null
          city?: string | null
          created_at?: string
          geofence_radius_meters?: number | null
          id?: string
          invite_code?: string | null
          is_active?: boolean | null
          is_under_construction?: boolean
          is_verified?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_society_admins?: number
          member_count?: number | null
          name?: string
          pincode?: string | null
          rules_text?: string | null
          security_confirmation_timeout_seconds?: number
          security_mode?: string
          slug?: string
          state?: string | null
          trust_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "societies_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "societies_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
        ]
      }
      society_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          is_system: boolean | null
          metadata: Json | null
          society_id: string
          tower_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          is_system?: boolean | null
          metadata?: Json | null
          society_id: string
          tower_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          is_system?: boolean | null
          metadata?: Json | null
          society_id?: string
          tower_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "society_activity_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_activity_tower_id_fkey"
            columns: ["tower_id"]
            isOneToOne: false
            referencedRelation: "project_towers"
            referencedColumns: ["id"]
          },
        ]
      }
      society_admins: {
        Row: {
          appointed_by: string | null
          created_at: string
          deactivated_at: string | null
          id: string
          permissions: Json | null
          role: string
          society_id: string
          user_id: string
        }
        Insert: {
          appointed_by?: string | null
          created_at?: string
          deactivated_at?: string | null
          id?: string
          permissions?: Json | null
          role?: string
          society_id: string
          user_id: string
        }
        Update: {
          appointed_by?: string | null
          created_at?: string
          deactivated_at?: string | null
          id?: string
          permissions?: Json | null
          role?: string
          society_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_admins_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_budgets: {
        Row: {
          budget_amount: number
          category: string
          created_at: string
          fiscal_year: string
          id: string
          society_id: string
          updated_at: string
        }
        Insert: {
          budget_amount?: number
          category: string
          created_at?: string
          fiscal_year?: string
          id?: string
          society_id: string
          updated_at?: string
        }
        Update: {
          budget_amount?: number
          category?: string
          created_at?: string
          fiscal_year?: string
          id?: string
          society_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_budgets_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_expenses: {
        Row: {
          added_by: string | null
          amount: number
          approved_by: string | null
          category: string
          created_at: string
          created_by: string
          description: string | null
          expense_date: string
          id: string
          receipt_url: string | null
          society_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          amount: number
          approved_by?: string | null
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          expense_date?: string
          id?: string
          receipt_url?: string | null
          society_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          amount?: number
          approved_by?: string | null
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          expense_date?: string
          id?: string
          receipt_url?: string | null
          society_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_expenses_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_feature_overrides: {
        Row: {
          config_override: Json | null
          created_at: string
          feature_id: string
          id: string
          is_enabled: boolean
          overridden_by: string | null
          society_id: string
        }
        Insert: {
          config_override?: Json | null
          created_at?: string
          feature_id: string
          id?: string
          is_enabled?: boolean
          overridden_by?: string | null
          society_id: string
        }
        Update: {
          config_override?: Json | null
          created_at?: string
          feature_id?: string
          id?: string
          is_enabled?: boolean
          overridden_by?: string | null
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_feature_overrides_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "platform_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_feature_overrides_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_feature_overrides_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_features: {
        Row: {
          config: Json
          created_at: string
          feature_key: string
          id: string
          is_enabled: boolean
          society_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          feature_key: string
          id?: string
          is_enabled?: boolean
          society_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          feature_key?: string
          id?: string
          is_enabled?: boolean
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_features_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_income: {
        Row: {
          added_by: string | null
          amount: number
          category: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          income_date: string
          receipt_url: string | null
          received_from: string | null
          society_id: string
          title: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          amount: number
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          income_date?: string
          receipt_url?: string | null
          received_from?: string | null
          society_id: string
          title: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          income_date?: string
          receipt_url?: string | null
          received_from?: string | null
          society_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_income_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_notices: {
        Row: {
          body: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          posted_by: string
          priority: string
          society_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          posted_by: string
          priority?: string
          society_id: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          posted_by?: string
          priority?: string
          society_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_notices_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_notices_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_report_cards: {
        Row: {
          active_sellers: number | null
          created_at: string
          highlights: Json | null
          id: string
          new_members: number | null
          report_month: string
          satisfaction_score: number | null
          society_id: string
          total_expenses: number | null
          total_income: number | null
          total_orders: number | null
        }
        Insert: {
          active_sellers?: number | null
          created_at?: string
          highlights?: Json | null
          id?: string
          new_members?: number | null
          report_month: string
          satisfaction_score?: number | null
          society_id: string
          total_expenses?: number | null
          total_income?: number | null
          total_orders?: number | null
        }
        Update: {
          active_sellers?: number | null
          created_at?: string
          highlights?: Json | null
          id?: string
          new_members?: number | null
          report_month?: string
          satisfaction_score?: number | null
          society_id?: string
          total_expenses?: number | null
          total_income?: number | null
          total_orders?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "society_report_cards_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_reports: {
        Row: {
          created_at: string
          id: string
          report_data: Json
          report_month: string
          society_id: string
          trust_score: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          report_data?: Json
          report_month: string
          society_id: string
          trust_score?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          report_data?: Json
          report_month?: string
          society_id?: string
          trust_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "society_reports_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_worker_categories: {
        Row: {
          color: string | null
          created_at: string
          display_name: string
          entry_type: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          display_name: string
          entry_type?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          display_name?: string
          entry_type?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      society_workers: {
        Row: {
          active_days: string[] | null
          allowed_shift_end: string | null
          allowed_shift_start: string | null
          category_id: string | null
          created_at: string
          emergency_contact_phone: string | null
          entry_frequency: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          photo_url: string | null
          preferred_language: string | null
          rating: number | null
          registered_by: string | null
          society_id: string
          status: string
          suspension_reason: string | null
          total_jobs: number | null
          total_ratings: number | null
          updated_at: string
          worker_type: string
        }
        Insert: {
          active_days?: string[] | null
          allowed_shift_end?: string | null
          allowed_shift_start?: string | null
          category_id?: string | null
          created_at?: string
          emergency_contact_phone?: string | null
          entry_frequency?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          photo_url?: string | null
          preferred_language?: string | null
          rating?: number | null
          registered_by?: string | null
          society_id: string
          status?: string
          suspension_reason?: string | null
          total_jobs?: number | null
          total_ratings?: number | null
          updated_at?: string
          worker_type?: string
        }
        Update: {
          active_days?: string[] | null
          allowed_shift_end?: string | null
          allowed_shift_start?: string | null
          category_id?: string | null
          created_at?: string
          emergency_contact_phone?: string | null
          entry_frequency?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          photo_url?: string | null
          preferred_language?: string | null
          rating?: number | null
          registered_by?: string | null
          society_id?: string
          status?: string
          suspension_reason?: string | null
          total_jobs?: number | null
          total_ratings?: number | null
          updated_at?: string
          worker_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_workers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "society_worker_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_workers_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_workers_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_watchlist: {
        Row: {
          created_at: string
          id: string
          notified: boolean
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notified?: boolean
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notified?: boolean
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_watchlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_config_id: string
          created_at: string
          display_name: string
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          category_config_id: string
          created_at?: string
          display_name: string
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          category_config_id?: string
          created_at?: string
          display_name?: string
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_config_id_fkey"
            columns: ["category_config_id"]
            isOneToOne: false
            referencedRelation: "category_config"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_deliveries: {
        Row: {
          created_at: string
          delivery_date: string
          id: string
          order_id: string | null
          status: string
          subscription_id: string
        }
        Insert: {
          created_at?: string
          delivery_date: string
          id?: string
          order_id?: string | null
          status?: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          delivery_date?: string
          id?: string
          order_id?: string | null
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          buyer_id: string
          created_at: string
          custom_days: string[] | null
          delivery_time_preference: string | null
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          paused_until: string | null
          product_id: string
          quantity: number
          seller_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          custom_days?: string[] | null
          delivery_time_preference?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          paused_until?: string | null
          product_id: string
          quantity?: number
          seller_id: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          custom_days?: string[] | null
          delivery_time_preference?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          paused_until?: string | null
          product_id?: string
          quantity?: number
          seller_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supported_languages: {
        Row: {
          code: string
          id: string
          is_active: boolean
          name: string
          native_name: string
          sort_order: number | null
        }
        Insert: {
          code: string
          id?: string
          is_active?: boolean
          name: string
          native_name: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          id?: string
          is_active?: boolean
          name?: string
          native_name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      test_results: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_log: string | null
          error_message: string | null
          executed_at: string | null
          file_path: string | null
          http_status_code: number | null
          id: string
          input_data: Json | null
          module_name: string | null
          outcome: string | null
          page_or_api_url: string | null
          response_payload: Json | null
          results: Json | null
          run_by: string | null
          run_id: string | null
          scenario_id: string | null
          scenario_name: string
          status: string
          test_name: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_log?: string | null
          error_message?: string | null
          executed_at?: string | null
          file_path?: string | null
          http_status_code?: number | null
          id?: string
          input_data?: Json | null
          module_name?: string | null
          outcome?: string | null
          page_or_api_url?: string | null
          response_payload?: Json | null
          results?: Json | null
          run_by?: string | null
          run_id?: string | null
          scenario_id?: string | null
          scenario_name: string
          status?: string
          test_name?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_log?: string | null
          error_message?: string | null
          executed_at?: string | null
          file_path?: string | null
          http_status_code?: number | null
          id?: string
          input_data?: Json | null
          module_name?: string | null
          outcome?: string | null
          page_or_api_url?: string | null
          response_payload?: Json | null
          results?: Json | null
          run_by?: string | null
          run_id?: string | null
          scenario_id?: string | null
          scenario_name?: string
          status?: string
          test_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_results_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      test_scenarios: {
        Row: {
          category: string
          created_at: string
          description: string | null
          expected_results: Json | null
          id: string
          is_active: boolean
          name: string
          steps: Json
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          expected_results?: Json | null
          id?: string
          is_active?: boolean
          name: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          expected_results?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: []
      }
      transaction_audit_trail: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          id: string
          metadata: Json | null
          new_status: string | null
          old_status: string | null
          order_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          old_status?: string | null
          order_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          old_status?: string | null
          order_id?: string
        }
        Relationships: []
      }
      trigger_errors: {
        Row: {
          created_at: string
          error_detail: string | null
          error_message: string
          id: string
          table_name: string
          trigger_name: string
        }
        Insert: {
          created_at?: string
          error_detail?: string | null
          error_message: string
          id?: string
          table_name: string
          trigger_name: string
        }
        Update: {
          created_at?: string
          error_detail?: string | null
          error_message?: string
          id?: string
          table_name?: string
          trigger_name?: string
        }
        Relationships: []
      }
      trust_tier_config: {
        Row: {
          benefits: Json | null
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          max_score: number
          min_score: number
          tier_key: string
          tier_name: string
        }
        Insert: {
          benefits?: Json | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          max_score?: number
          min_score?: number
          tier_key: string
          tier_name: string
        }
        Update: {
          benefits?: Json | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          max_score?: number
          min_score?: number
          tier_key?: string
          tier_name?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          created_at: string
          id: string
          message: string | null
          page_context: string | null
          rating: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          page_context?: string | null
          rating: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          page_context?: string | null
          rating?: number
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          society_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          society_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          society_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitor_entries: {
        Row: {
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string
          expected_date: string | null
          expected_time: string | null
          flat_number: string | null
          guard_notes: string | null
          id: string
          is_preapproved: boolean
          is_recurring: boolean
          otp_code: string | null
          otp_expires_at: string | null
          photo_url: string | null
          purpose: string | null
          recurring_days: string[] | null
          resident_id: string
          society_id: string
          status: string
          updated_at: string
          vehicle_number: string | null
          visitor_name: string
          visitor_phone: string | null
          visitor_type: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          expected_date?: string | null
          expected_time?: string | null
          flat_number?: string | null
          guard_notes?: string | null
          id?: string
          is_preapproved?: boolean
          is_recurring?: boolean
          otp_code?: string | null
          otp_expires_at?: string | null
          photo_url?: string | null
          purpose?: string | null
          recurring_days?: string[] | null
          resident_id: string
          society_id: string
          status?: string
          updated_at?: string
          vehicle_number?: string | null
          visitor_name: string
          visitor_phone?: string | null
          visitor_type?: string
        }
        Update: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          expected_date?: string | null
          expected_time?: string | null
          flat_number?: string | null
          guard_notes?: string | null
          id?: string
          is_preapproved?: boolean
          is_recurring?: boolean
          otp_code?: string | null
          otp_expires_at?: string | null
          photo_url?: string | null
          purpose?: string | null
          recurring_days?: string[] | null
          resident_id?: string
          society_id?: string
          status?: string
          updated_at?: string
          vehicle_number?: string | null
          visitor_name?: string
          visitor_phone?: string | null
          visitor_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_entries_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_entries_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_types: {
        Row: {
          created_at: string
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean
          label: string | null
          society_id: string
          type_key: string | null
          type_name: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          society_id: string
          type_key?: string | null
          type_name: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          society_id?: string
          type_key?: string | null
          type_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_types_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      warnings: {
        Row: {
          acknowledged_at: string | null
          created_at: string | null
          id: string
          issued_by: string
          reason: string
          severity: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string | null
          id?: string
          issued_by: string
          reason: string
          severity?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string | null
          id?: string
          issued_by?: string
          reason?: string
          severity?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_attendance: {
        Row: {
          check_in_at: string
          check_out_at: string | null
          created_at: string
          date: string
          entry_method: string | null
          id: string
          society_id: string
          verified_by: string | null
          worker_id: string
        }
        Insert: {
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          date?: string
          entry_method?: string | null
          id?: string
          society_id: string
          verified_by?: string | null
          worker_id: string
        }
        Update: {
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          date?: string
          entry_method?: string | null
          id?: string
          society_id?: string
          verified_by?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_attendance_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_attendance_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "society_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_entry_logs: {
        Row: {
          created_at: string
          entry_time: string
          exit_time: string | null
          gate_id: string | null
          id: string
          logged_by: string | null
          society_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          entry_time?: string
          exit_time?: string | null
          gate_id?: string | null
          id?: string
          logged_by?: string | null
          society_id: string
          worker_id: string
        }
        Update: {
          created_at?: string
          entry_time?: string
          exit_time?: string | null
          gate_id?: string | null
          id?: string
          logged_by?: string | null
          society_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_entry_logs_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "gate_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_entry_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_entry_logs_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_entry_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "society_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_flat_assignments: {
        Row: {
          created_at: string
          flat_number: string
          id: string
          is_active: boolean
          resident_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          flat_number: string
          id?: string
          is_active?: boolean
          resident_id: string
          worker_id: string
        }
        Update: {
          created_at?: string
          flat_number?: string
          id?: string
          is_active?: boolean
          resident_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_flat_assignments_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_flat_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "society_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_job_requests: {
        Row: {
          budget_range: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          job_type: string
          preferred_date: string | null
          preferred_time: string | null
          resident_id: string
          resident_rating: number | null
          resident_review: string | null
          society_id: string
          status: string
          target_society_ids: string[] | null
          updated_at: string
          visibility_scope: string
          worker_id: string | null
        }
        Insert: {
          budget_range?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          job_type: string
          preferred_date?: string | null
          preferred_time?: string | null
          resident_id: string
          resident_rating?: number | null
          resident_review?: string | null
          society_id: string
          status?: string
          target_society_ids?: string[] | null
          updated_at?: string
          visibility_scope?: string
          worker_id?: string | null
        }
        Update: {
          budget_range?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          job_type?: string
          preferred_date?: string | null
          preferred_time?: string | null
          resident_id?: string
          resident_rating?: number | null
          resident_review?: string | null
          society_id?: string
          status?: string
          target_society_ids?: string[] | null
          updated_at?: string
          visibility_scope?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_job_requests_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_job_requests_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_job_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "society_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_leave_records: {
        Row: {
          created_at: string | null
          id: string
          leave_date: string
          leave_type: string
          marked_by: string | null
          reason: string | null
          society_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          leave_date: string
          leave_type?: string
          marked_by?: string | null
          reason?: string | null
          society_id: string
          worker_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          leave_date?: string
          leave_type?: string
          marked_by?: string | null
          reason?: string | null
          society_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_leave_records_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_leave_records_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_leave_records_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "society_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          resident_id: string
          worker_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          resident_id: string
          worker_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          resident_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_ratings_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "society_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_salary_records: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          month: string
          notes: string | null
          paid_date: string | null
          resident_id: string
          society_id: string
          status: string
          worker_id: string
        }
        Insert: {
          amount?: number
          created_at?: string | null
          id?: string
          month: string
          notes?: string | null
          paid_date?: string | null
          resident_id: string
          society_id: string
          status?: string
          worker_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          month?: string
          notes?: string | null
          paid_date?: string | null
          resident_id?: string
          society_id?: string
          status?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_salary_records_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_salary_records_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_salary_records_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "society_workers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      society_admin_roles: {
        Row: {
          appointed_by: string | null
          created_at: string | null
          deactivated_at: string | null
          id: string | null
          is_active: boolean | null
          permissions: Json | null
          role: string | null
          society_id: string | null
          user_id: string | null
        }
        Insert: {
          appointed_by?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          id?: string | null
          is_active?: never
          permissions?: Json | null
          role?: string | null
          society_id?: string | null
          user_id?: string | null
        }
        Update: {
          appointed_by?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          id?: string | null
          is_active?: never
          permissions?: Json | null
          role?: string | null
          society_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "society_admins_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_worker_job: {
        Args: { _job_id: string; _worker_id: string }
        Returns: Json
      }
      apply_maintenance_late_fees: { Args: never; Returns: undefined }
      auto_checkout_visitors: { Args: never; Returns: undefined }
      auto_escalate_overdue_disputes: { Args: never; Returns: undefined }
      buyer_cancel_pending_orders: {
        Args: { _order_ids: string[] }
        Returns: number
      }
      buyer_confirm_delivery: {
        Args: { _order_id: string }
        Returns: undefined
      }
      buyer_mark_order_completed: {
        Args: { _order_id: string }
        Returns: {
          actual_delivery_time: string | null
          auto_cancel_at: string | null
          auto_complete_at: string | null
          buyer_confirmed_at: string | null
          buyer_id: string | null
          buyer_society_id: string | null
          coupon_discount: number | null
          coupon_id: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_address_id: string | null
          delivery_fee: number | null
          delivery_handled_by: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          deposit_paid: boolean | null
          deposit_refunded: boolean | null
          discount_amount: number | null
          distance_km: number | null
          estimated_delivery_at: string | null
          estimated_delivery_time: string | null
          failure_owner: string | null
          frozen_total: number | null
          fulfillment_type: string
          id: string
          idempotency_key: string | null
          is_cross_society: boolean
          needs_attention: boolean | null
          needs_attention_reason: string | null
          net_amount: number | null
          notes: string | null
          notify_buyer: boolean | null
          notify_seller: boolean | null
          order_type: string | null
          otp_code: string | null
          otp_verified: boolean | null
          packaging_fee: number | null
          payment_confirmed_at: string | null
          payment_mode: string | null
          payment_status: string | null
          payment_type: string | null
          price_stable_since: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          ready_at: string | null
          rejection_reason: string | null
          rental_end_date: string | null
          rental_start_date: string | null
          scheduled_date: string | null
          scheduled_delivery_time: string | null
          scheduled_time_end: string | null
          scheduled_time_start: string | null
          seller_id: string | null
          seller_society_id: string | null
          society_id: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          status_updated_at: string | null
          subtotal: number | null
          total_amount: number
          transaction_type: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      calculate_society_trust_score: {
        Args: { _society_id: string }
        Returns: number
      }
      calculate_trust_score: { Args: { _seller_id: string }; Returns: number }
      can_access_feature: {
        Args: { _feature_key: string; _society_id: string }
        Returns: boolean
      }
      can_manage_society: {
        Args: { _society_id: string; _user_id: string }
        Returns: boolean
      }
      can_write_to_society: {
        Args: { _society_id: string; _user_id: string }
        Returns: boolean
      }
      claim_device_token: {
        Args: { _apns_token?: string; _platform?: string; _token: string }
        Returns: undefined
      }
      claim_notification_queue: {
        Args: { _batch_size?: number }
        Returns: {
          body: string
          created_at: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          payload: Json | null
          processed_at: string | null
          reference_path: string | null
          retry_count: number
          status: string
          title: string
          type: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_worker_job: { Args: { _job_id: string }; Returns: Json }
      compute_store_status: { Args: { _seller_id: string }; Returns: string }
      confirm_cod_payment: { Args: { _order_id: string }; Returns: undefined }
      confirm_upi_payment: {
        Args: { _order_id: string; _upi_reference?: string }
        Returns: undefined
      }
      disable_cron_job: { Args: { _job_name: string }; Returns: undefined }
      enable_cron_job: { Args: { _job_name: string }; Returns: undefined }
      generate_generic_otp: {
        Args: { _order_id: string; _otp_type?: string }
        Returns: string
      }
      generate_recurring_visitor_entries: { Args: never; Returns: undefined }
      get_allowed_transitions: {
        Args: { _actor?: string; _order_id: string }
        Returns: {
          display_label: string
          to_status: string
        }[]
      }
      get_builder_dashboard: { Args: { _builder_id: string }; Returns: Json }
      get_category_parent_group: {
        Args: { _category: string }
        Returns: string
      }
      get_cron_job_runs: {
        Args: { _job_name: string; _limit?: number }
        Returns: {
          command: string
          database: string
          end_time: string
          job_pid: number
          return_message: string
          runid: number
          start_time: string
          status: string
          username: string
        }[]
      }
      get_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          command: string
          database: string
          jobid: number
          jobname: string
          nodename: string
          nodeport: number
          schedule: string
          username: string
        }[]
      }
      get_effective_society_features: {
        Args: { _society_id: string }
        Returns: {
          display_name: string
          feature_key: string
          is_enabled: boolean
          source: string
        }[]
      }
      get_location_stats: { Args: { _society_id: string }; Returns: Json }
      get_nearby_societies: {
        Args: { _lat: number; _lon: number; _radius_km?: number }
        Returns: {
          address: string
          distance_km: number
          id: string
          latitude: number
          longitude: number
          name: string
        }[]
      }
      get_product_trust_metrics: {
        Args: { _product_ids: string[] }
        Returns: {
          last_ordered_at: string
          product_id: string
          repeat_buyer_count: number
          total_orders: number
          unique_buyers: number
        }[]
      }
      get_products_for_sellers: {
        Args: {
          _category?: string
          _limit?: number
          _offset?: number
          _seller_ids: string[]
        }
        Returns: {
          action_type: string
          category: string
          contact_phone: string
          description: string
          discount_percentage: number
          image_url: string
          is_available: boolean
          is_bestseller: boolean
          is_recommended: boolean
          is_urgent: boolean
          is_veg: boolean
          mrp: number
          price: number
          product_id: string
          product_name: string
          seller_id: string
        }[]
      }
      get_seller_demand_stats: {
        Args: { _seller_id: string }
        Returns: {
          has_product: boolean
          search_count: number
          search_term: string
        }[]
      }
      get_seller_trust_snapshot: {
        Args: { _seller_id: string }
        Returns: {
          avg_response_min: number
          cancelled_orders: number
          completed_orders: number
          recent_order_count: number
          repeat_customer_pct: number
          unique_customers: number
        }[]
      }
      get_society_order_stats: { Args: { _society_id: string }; Returns: Json }
      get_unified_gate_log: {
        Args: { _date?: string; _society_id: string }
        Returns: {
          details: string
          entry_time: string
          entry_type: string
          exit_time: string
          flat_number: string
          person_name: string
          status: string
        }[]
      }
      get_unmet_demand: {
        Args: { _limit?: number; _society_id: string }
        Returns: {
          last_searched_at: string
          search_count: number
          search_term: string
        }[]
      }
      get_user_auth_context: { Args: { _user_id: string }; Returns: Json }
      get_user_society_id: { Args: { _user_id: string }; Returns: string }
      get_visitor_types_for_society: {
        Args: { _society_id: string }
        Returns: {
          auto_approve: boolean
          display_name: string
          icon: string
          requires_flat: boolean
          requires_vehicle: boolean
          type_key: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      haversine_km: {
        Args: { _lat1: number; _lat2: number; _lon1: number; _lon2: number }
        Returns: number
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_builder_for_society: {
        Args: { _society_id: string; _user_id: string }
        Returns: boolean
      }
      is_builder_member: {
        Args: { _builder_id: string; _user_id: string }
        Returns: boolean
      }
      is_feature_enabled_for_society: {
        Args: { _feature_key: string; _society_id: string }
        Returns: boolean
      }
      is_security_officer: {
        Args: { _society_id: string; _user_id: string }
        Returns: boolean
      }
      is_society_admin: {
        Args: { _society_id: string; _user_id: string }
        Returns: boolean
      }
      map_transaction_type_to_action_type: {
        Args: { _transaction_type: string }
        Returns: string
      }
      notify_upcoming_maintenance_dues: { Args: never; Returns: undefined }
      rate_worker_job: {
        Args: { _job_id: string; _rating: number; _review?: string }
        Returns: Json
      }
      recompute_seller_stats: {
        Args: { _seller_id: string }
        Returns: undefined
      }
      refresh_all_trust_scores: { Args: never; Returns: undefined }
      search_marketplace: {
        Args: { search_term: string; user_society_id?: string }
        Returns: {
          availability_end: string
          availability_start: string
          business_name: string
          categories: string[]
          cover_image_url: string
          description: string
          is_available: boolean
          is_featured: boolean
          matching_products: Json
          primary_group: string
          profile_image_url: string
          rating: number
          seller_id: string
          total_reviews: number
          user_id: string
        }[]
      }
      search_nearby_sellers: {
        Args: {
          _buyer_society_id: string
          _category?: string
          _radius_km?: number
          _search_term?: string
        }
        Returns: {
          availability_end: string
          availability_start: string
          business_name: string
          categories: string[]
          cover_image_url: string
          description: string
          distance_km: number
          is_available: boolean
          is_featured: boolean
          matching_products: Json
          primary_group: string
          profile_image_url: string
          rating: number
          seller_id: string
          society_name: string
          total_reviews: number
          user_id: string
        }[]
      }
      search_products_fts: {
        Args: {
          _category?: string
          _lat?: number
          _limit?: number
          _lng?: number
          _offset?: number
          _query: string
          _radius_km?: number
        }
        Returns: {
          action_type: string
          brand: string
          category: string
          description: string
          discount_percentage: number
          distance_km: number
          image_url: string
          is_available: boolean
          is_veg: boolean
          mrp: number
          price: number
          product_id: string
          product_name: string
          rank: number
          seller_id: string
          seller_name: string
          seller_profile_image: string
          seller_rating: number
          seller_total_reviews: number
          society_name: string
        }[]
      }
      search_sellers_by_location: {
        Args: {
          _category?: string
          _lat: number
          _lng: number
          _radius_km?: number
        }
        Returns: {
          business_name: string
          categories: string[]
          cover_image_url: string
          description: string
          distance_km: number
          id: string
          profile_image_url: string
          rating: number
          society_name: string
          total_reviews: number
        }[]
      }
      search_sellers_paginated: {
        Args: {
          _lat: number
          _limit?: number
          _lng: number
          _offset?: number
          _radius_km?: number
        }
        Returns: {
          availability_end: string
          availability_start: string
          business_name: string
          categories: string[]
          cover_image_url: string
          description: string
          distance_km: number
          is_available: boolean
          is_featured: boolean
          operating_days: string[]
          primary_group: string
          product_count: number
          profile_image_url: string
          rating: number
          seller_id: string
          seller_latitude: number
          seller_longitude: number
          society_name: string
          total_reviews: number
          user_id: string
        }[]
      }
      seller_advance_order: {
        Args: {
          _new_status: Database["public"]["Enums"]["order_status"]
          _order_id: string
          _rejection_reason?: string
        }
        Returns: undefined
      }
      service_complete_delivery: {
        Args: { _assignment_id: string; _order_id: string }
        Returns: undefined
      }
      set_my_society_coordinates: {
        Args: { _lat: number; _lng: number }
        Returns: undefined
      }
      set_my_store_coordinates: {
        Args: { _lat: number; _lng: number; _seller_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_buyer_delivery_location: {
        Args: {
          _delivery_lat: number
          _delivery_lng: number
          _order_id: string
        }
        Returns: {
          actual_delivery_time: string | null
          auto_cancel_at: string | null
          auto_complete_at: string | null
          buyer_confirmed_at: string | null
          buyer_id: string | null
          buyer_society_id: string | null
          coupon_discount: number | null
          coupon_id: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_address_id: string | null
          delivery_fee: number | null
          delivery_handled_by: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          deposit_paid: boolean | null
          deposit_refunded: boolean | null
          discount_amount: number | null
          distance_km: number | null
          estimated_delivery_at: string | null
          estimated_delivery_time: string | null
          failure_owner: string | null
          frozen_total: number | null
          fulfillment_type: string
          id: string
          idempotency_key: string | null
          is_cross_society: boolean
          needs_attention: boolean | null
          needs_attention_reason: string | null
          net_amount: number | null
          notes: string | null
          notify_buyer: boolean | null
          notify_seller: boolean | null
          order_type: string | null
          otp_code: string | null
          otp_verified: boolean | null
          packaging_fee: number | null
          payment_confirmed_at: string | null
          payment_mode: string | null
          payment_status: string | null
          payment_type: string | null
          price_stable_since: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          ready_at: string | null
          rejection_reason: string | null
          rental_end_date: string | null
          rental_start_date: string | null
          scheduled_date: string | null
          scheduled_delivery_time: string | null
          scheduled_time_end: string | null
          scheduled_time_start: string | null
          seller_id: string | null
          seller_society_id: string | null
          society_id: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          status_updated_at: string | null
          subtotal: number | null
          total_amount: number
          transaction_type: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_cron_schedule: {
        Args: { p_jobid: number; p_schedule: string }
        Returns: undefined
      }
      validate_worker_entry: {
        Args: { _society_id: string; _worker_id: string }
        Returns: Json
      }
      verify_generic_otp_and_advance: {
        Args: { _order_id: string; _otp_code: string; _target_status: string }
        Returns: undefined
      }
      verify_seller_payment: {
        Args: { _order_id: string; _upi_reference?: string }
        Returns: undefined
      }
    }
    Enums: {
      fulfillment_mod: "draft" | "self" | "delivery" | "pickup" | "digital"
      order_status:
        | "placed"
        | "accepted"
        | "preparing"
        | "ready"
        | "completed"
        | "cancelled"
        | "picked_up"
        | "delivered"
        | "payment_pending"
        | "on_the_way"
        | "arrived"
        | "assigned"
        | "enquired"
        | "quoted"
        | "scheduled"
        | "in_progress"
        | "returned"
      product_category:
        | "home_food"
        | "bakery"
        | "snacks"
        | "groceries"
        | "other"
        | "ayurveda"
      seller_type_enum: "society_resident" | "commercial"
      user_role: "buyer" | "seller" | "admin"
      verification_status:
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
        | "draft"
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
      fulfillment_mod: ["draft", "self", "delivery", "pickup", "digital"],
      order_status: [
        "placed",
        "accepted",
        "preparing",
        "ready",
        "completed",
        "cancelled",
        "picked_up",
        "delivered",
        "payment_pending",
        "on_the_way",
        "arrived",
        "assigned",
        "enquired",
        "quoted",
        "scheduled",
        "in_progress",
        "returned",
      ],
      product_category: [
        "home_food",
        "bakery",
        "snacks",
        "groceries",
        "other",
        "ayurveda",
      ],
      seller_type_enum: ["society_resident", "commercial"],
      user_role: ["buyer", "seller", "admin"],
      verification_status: [
        "pending",
        "approved",
        "rejected",
        "suspended",
        "draft",
      ],
    },
  },
} as const
