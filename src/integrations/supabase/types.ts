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
      addresses: {
        Row: {
          city: string
          complement: string | null
          country: string
          created_at: string
          id: string
          is_billing: boolean
          is_default: boolean
          is_shipping: boolean
          label: string | null
          neighborhood: string
          number: string
          recipient_name: string
          state: string
          street: string
          updated_at: string
          user_id: string
          zipcode: string
        }
        Insert: {
          city: string
          complement?: string | null
          country?: string
          created_at?: string
          id?: string
          is_billing?: boolean
          is_default?: boolean
          is_shipping?: boolean
          label?: string | null
          neighborhood: string
          number: string
          recipient_name: string
          state: string
          street: string
          updated_at?: string
          user_id: string
          zipcode: string
        }
        Update: {
          city?: string
          complement?: string | null
          country?: string
          created_at?: string
          id?: string
          is_billing?: boolean
          is_default?: boolean
          is_shipping?: boolean
          label?: string | null
          neighborhood?: string
          number?: string
          recipient_name?: string
          state?: string
          street?: string
          updated_at?: string
          user_id?: string
          zipcode?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          created_at: string
          cta_label: string | null
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          position: string
          sort_order: number
          subtitle: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          position?: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          position?: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          banner_image: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          banner_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          banner_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          discount_value: number
          id: string
          order_id: string | null
          user_id: string | null
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_value: number
          id?: string
          order_id?: string | null
          user_id?: string | null
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_value?: number
          id?: string
          order_id?: string | null
          user_id?: string | null
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
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          max_uses_per_user: number | null
          min_order_value: number | null
          starts_at: string | null
          type: Database["public"]["Enums"]["coupon_type"]
          uses_count: number
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_user?: number | null
          min_order_value?: number | null
          starts_at?: string | null
          type: Database["public"]["Enums"]["coupon_type"]
          uses_count?: number
          value?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_user?: number | null
          min_order_value?: number | null
          starts_at?: string | null
          type?: Database["public"]["Enums"]["coupon_type"]
          uses_count?: number
          value?: number
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      grapes: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          name?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          product_image: string | null
          product_name: string
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_image?: string | null
          product_name: string
          quantity: number
          total: number
          unit_price: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          product_image?: string | null
          product_name?: string
          quantity?: number
          total?: number
          unit_price?: number
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
      order_status_history: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          carrier: string | null
          coupon_code: string | null
          created_at: string
          customer_doc: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          discount: number
          estimated_delivery: string | null
          id: string
          notes: string | null
          order_number: string
          pagou_transaction_id: string | null
          payment_method: string | null
          payment_status: string | null
          pix_expiration: string | null
          pix_qr_code: string | null
          pix_receipt_mime: string | null
          pix_receipt_path: string | null
          pix_receipt_token: string | null
          pix_receipt_uploaded_at: string | null
          shipping: number
          shipping_address: Json
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          tracking_code: string | null
          user_id: string | null
        }
        Insert: {
          carrier?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_doc?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          discount?: number
          estimated_delivery?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          pagou_transaction_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          pix_expiration?: string | null
          pix_qr_code?: string | null
          pix_receipt_mime?: string | null
          pix_receipt_path?: string | null
          pix_receipt_token?: string | null
          pix_receipt_uploaded_at?: string | null
          shipping?: number
          shipping_address: Json
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          tracking_code?: string | null
          user_id?: string | null
        }
        Update: {
          carrier?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_doc?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          discount?: number
          estimated_delivery?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          pagou_transaction_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          pix_expiration?: string | null
          pix_qr_code?: string | null
          pix_receipt_mime?: string | null
          pix_receipt_path?: string | null
          pix_receipt_token?: string | null
          pix_receipt_uploaded_at?: string | null
          shipping?: number
          shipping_address?: Json
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          tracking_code?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          category_id: string
          product_id: string
        }
        Insert: {
          category_id: string
          product_id: string
        }
        Update: {
          category_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suggestions: {
        Row: {
          product_id: string
          suggested_product_id: string
          sort_order: number
        }
        Insert: {
          product_id: string
          suggested_product_id: string
          sort_order?: number
        }
        Update: {
          product_id?: string
          suggested_product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suggestions_suggested_product_id_fkey"
            columns: ["suggested_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_grapes: {
        Row: {
          grape_id: string
          product_id: string
        }
        Insert: {
          grape_id: string
          product_id: string
        }
        Update: {
          grape_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_grapes_grape_id_fkey"
            columns: ["grape_id"]
            isOneToOne: false
            referencedRelation: "grapes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_grapes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          aging: string | null
          alcohol_content: string | null
          best_seller: boolean
          brand: string | null
          brand_id: string | null
          category_id: string | null
          classification: string | null
          collection_id: string | null
          color: Database["public"]["Enums"]["wine_color_enum"] | null
          compare_at_price: number | null
          country: string | null
          created_at: string
          decanting: string | null
          description: string | null
          featured: boolean
          gallery: Json
          glass_type: string | null
          grape: string | null
          harmonizacao: string[]
          harmonization: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_zero_alcohol: boolean
          name: string
          nose_notes: string | null
          palate_notes: string | null
          price: number
          product_type: Database["public"]["Enums"]["product_type_enum"] | null
          rating: number | null
          region: string | null
          region_id: string | null
          selo: string[]
          serving_temp: string | null
          short_description: string | null
          sku: string | null
          slug: string
          stock: number
          gtin: string | null
          updated_at: string
          video_url: string | null
          vintage: string | null
          visual_notes: string | null
          vivino_rating: number | null
          wine_style: string | null
          wine_type: string | null
        }
        Insert: {
          aging?: string | null
          alcohol_content?: string | null
          best_seller?: boolean
          brand?: string | null
          brand_id?: string | null
          category_id?: string | null
          classification?: string | null
          collection_id?: string | null
          color?: Database["public"]["Enums"]["wine_color_enum"] | null
          compare_at_price?: number | null
          country?: string | null
          created_at?: string
          decanting?: string | null
          description?: string | null
          featured?: boolean
          gallery?: Json
          glass_type?: string | null
          grape?: string | null
          gtin?: string | null
          harmonizacao?: string[]
          harmonization?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_zero_alcohol?: boolean
          name: string
          nose_notes?: string | null
          palate_notes?: string | null
          price: number
          product_type?: Database["public"]["Enums"]["product_type_enum"] | null
          rating?: number | null
          region?: string | null
          region_id?: string | null
          selo?: string[]
          serving_temp?: string | null
          short_description?: string | null
          sku?: string | null
          slug: string
          stock?: number
          updated_at?: string
          video_url?: string | null
          vintage?: string | null
          visual_notes?: string | null
          vivino_rating?: number | null
          wine_style?: string | null
          wine_type?: string | null
        }
        Update: {
          aging?: string | null
          alcohol_content?: string | null
          best_seller?: boolean
          brand?: string | null
          brand_id?: string | null
          category_id?: string | null
          classification?: string | null
          collection_id?: string | null
          color?: Database["public"]["Enums"]["wine_color_enum"] | null
          compare_at_price?: number | null
          country?: string | null
          created_at?: string
          decanting?: string | null
          description?: string | null
          featured?: boolean
          gallery?: Json
          glass_type?: string | null
          grape?: string | null
          gtin?: string | null
          harmonizacao?: string[]
          harmonization?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_zero_alcohol?: boolean
          name?: string
          nose_notes?: string | null
          palate_notes?: string | null
          price?: number
          product_type?: Database["public"]["Enums"]["product_type_enum"] | null
          rating?: number | null
          region?: string | null
          region_id?: string | null
          selo?: string[]
          serving_temp?: string | null
          short_description?: string | null
          sku?: string | null
          slug?: string
          stock?: number
          updated_at?: string
          video_url?: string | null
          vintage?: string | null
          visual_notes?: string | null
          vivino_rating?: number | null
          wine_style?: string | null
          wine_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          cpf: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      regions: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          is_approved: boolean
          photos: Json
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          photos?: Json
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          photos?: Json
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          pagou_event_id: string | null
          payload: Json
          processed: boolean
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          pagou_event_id?: string | null
          payload?: Json
          processed?: boolean
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          pagou_event_id?: string | null
          payload?: Json
          processed?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_user_id_by_email: {
        Args: { p_email: string }
        Returns: string | null
      }
      link_guest_orders_to_user: {
        Args: { p_user_id?: string | null }
        Returns: number
      }
      search_products: {
        Args: {
          q?: string | null
          filter_country?: string | null
          filter_grape?: string | null
          filter_wine_type?: string | null
          min_price?: number | null
          max_price?: number | null
          result_limit?: number | null
        }
        Returns: {
          id: string
          name: string
          slug: string
          price: number
          compare_at_price: number | null
          image_url: string | null
          country: string | null
          grape: string | null
          wine_type: string | null
          rating: number | null
          short_description: string | null
          brand: string | null
          featured: boolean | null
        }[]
      }
      sync_product_categories: {
        Args: { _product_id: string }
        Returns: undefined
      }
      user_has_purchased: {
        Args: { _product_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "customer"
      coupon_type: "fixed" | "percent" | "free_shipping" | "first_purchase"
      order_status:
        | "pending"
        | "confirmed"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "paid"
        | "separating"
        | "invoiced"
        | "out_for_delivery"
        | "refunded"
      product_type_enum:
        | "vinho"
        | "espumante"
        | "sangria"
        | "destilado"
        | "cerveja"
        | "suco"
        | "acessorio"
        | "gourmet"
        | "kit"
        | "outro"
      wine_color_enum: "tinto" | "branco" | "rose" | "misto" | "na"
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
      app_role: ["admin", "customer"],
      coupon_type: ["fixed", "percent", "free_shipping", "first_purchase"],
      order_status: [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
        "paid",
        "separating",
        "invoiced",
        "out_for_delivery",
        "refunded",
      ],
      product_type_enum: [
        "vinho",
        "espumante",
        "sangria",
        "destilado",
        "cerveja",
        "suco",
        "acessorio",
        "gourmet",
        "kit",
        "outro",
      ],
      wine_color_enum: ["tinto", "branco", "rose", "misto", "na"],
    },
  },
} as const
