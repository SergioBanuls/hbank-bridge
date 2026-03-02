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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      beta_codes: {
        Row: {
          activated_at: string | null
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          wallet_address: string | null
        }
        Insert: {
          activated_at?: string | null
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          wallet_address?: string | null
        }
        Update: {
          activated_at?: string | null
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      blocked_tokens: {
        Row: {
          created_at: string | null
          detected_from_tx: string | null
          reason: string
          token_id: string
          token_name: string | null
        }
        Insert: {
          created_at?: string | null
          detected_from_tx?: string | null
          reason?: string
          token_id: string
          token_name?: string | null
        }
        Update: {
          created_at?: string | null
          detected_from_tx?: string | null
          reason?: string
          token_id?: string
          token_name?: string | null
        }
        Relationships: []
      }
      bridge_history: {
        Row: {
          amount: string
          created_at: string | null
          direction: string
          id: string
          timestamp: string
          tx_hash: string
          usd_value: number
          wallet_address: string
        }
        Insert: {
          amount: string
          created_at?: string | null
          direction: string
          id?: string
          timestamp: string
          tx_hash: string
          usd_value: number
          wallet_address: string
        }
        Update: {
          amount?: string
          created_at?: string | null
          direction?: string
          id?: string
          timestamp?: string
          tx_hash?: string
          usd_value?: number
          wallet_address?: string
        }
        Relationships: []
      }
      custodial_accounts: {
        Row: {
          created_at: string | null
          evm_address: string | null
          hedera_account_id: string
          id: string
          kms_key_arn: string
          kms_key_id: string
          public_key_hex: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          evm_address?: string | null
          hedera_account_id: string
          id?: string
          kms_key_arn: string
          kms_key_id: string
          public_key_hex: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          evm_address?: string | null
          hedera_account_id?: string
          id?: string
          kms_key_arn?: string
          kms_key_id?: string
          public_key_hex?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      kms_rate_limits: {
        Row: {
          last_reset_1h: string | null
          last_reset_24h: string | null
          last_signing_at: string | null
          signing_count_1h: number | null
          signing_count_24h: number | null
          user_id: string
        }
        Insert: {
          last_reset_1h?: string | null
          last_reset_24h?: string | null
          last_signing_at?: string | null
          signing_count_1h?: number | null
          signing_count_24h?: number | null
          user_id: string
        }
        Update: {
          last_reset_1h?: string | null
          last_reset_24h?: string | null
          last_signing_at?: string | null
          signing_count_1h?: number | null
          signing_count_24h?: number | null
          user_id?: string
        }
        Relationships: []
      }
      kms_signing_audit: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          ip_address: string | null
          kms_key_id: string
          status: string
          transaction_id: string | null
          transaction_params: Json
          transaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          kms_key_id: string
          status?: string
          transaction_id?: string | null
          transaction_params?: Json
          transaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          kms_key_id?: string
          status?: string
          transaction_id?: string | null
          transaction_params?: Json
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      missions: {
        Row: {
          available_serials: number[]
          created_at: string | null
          current_claims: number
          description: string | null
          id: string
          is_active: boolean
          max_claims: number
          mission_type: string
          name: string
          nft_token_id: string
          requirement_value: number
          requirements: Json | null
          updated_at: string | null
        }
        Insert: {
          available_serials?: number[]
          created_at?: string | null
          current_claims?: number
          description?: string | null
          id?: string
          is_active?: boolean
          max_claims?: number
          mission_type: string
          name: string
          nft_token_id: string
          requirement_value: number
          requirements?: Json | null
          updated_at?: string | null
        }
        Update: {
          available_serials?: number[]
          created_at?: string | null
          current_claims?: number
          description?: string | null
          id?: string
          is_active?: boolean
          max_claims?: number
          mission_type?: string
          name?: string
          nft_token_id?: string
          requirement_value?: number
          requirements?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      perps_fee_tiers: {
        Row: {
          created_at: string | null
          display_name: string
          fee_rate_bps: number
          id: string
          is_active: boolean | null
          max_volume_usd: number | null
          min_volume_usd: number
          priority: number
          tier_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          fee_rate_bps: number
          id?: string
          is_active?: boolean | null
          max_volume_usd?: number | null
          min_volume_usd: number
          priority?: number
          tier_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          fee_rate_bps?: number
          id?: string
          is_active?: boolean | null
          max_volume_usd?: number | null
          min_volume_usd?: number
          priority?: number
          tier_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      perps_promotions: {
        Row: {
          created_at: string | null
          ends_at: string
          fee_rate_bps: number
          id: string
          is_active: boolean | null
          promo_code: string | null
          promo_name: string
          starts_at: string
          wallet_addresses: string[] | null
        }
        Insert: {
          created_at?: string | null
          ends_at: string
          fee_rate_bps: number
          id?: string
          is_active?: boolean | null
          promo_code?: string | null
          promo_name: string
          starts_at: string
          wallet_addresses?: string[] | null
        }
        Update: {
          created_at?: string | null
          ends_at?: string
          fee_rate_bps?: number
          id?: string
          is_active?: boolean | null
          promo_code?: string | null
          promo_name?: string
          starts_at?: string
          wallet_addresses?: string[] | null
        }
        Relationships: []
      }
      perps_trade_history: {
        Row: {
          asset_index: number
          asset_symbol: string
          builder_fee_usd: number
          created_at: string | null
          fee_rate_bps: number
          filled_at: string
          id: string
          notional_value_usd: number
          order_id: string
          price: number
          promo_applied: string | null
          side: string
          size: number
          tier_applied: string | null
          wallet_address: string
        }
        Insert: {
          asset_index: number
          asset_symbol: string
          builder_fee_usd: number
          created_at?: string | null
          fee_rate_bps: number
          filled_at: string
          id?: string
          notional_value_usd: number
          order_id: string
          price: number
          promo_applied?: string | null
          side: string
          size: number
          tier_applied?: string | null
          wallet_address: string
        }
        Update: {
          asset_index?: number
          asset_symbol?: string
          builder_fee_usd?: number
          created_at?: string | null
          fee_rate_bps?: number
          filled_at?: string
          id?: string
          notional_value_usd?: number
          order_id?: string
          price?: number
          promo_applied?: string | null
          side?: string
          size?: number
          tier_applied?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "perps_trade_history_promo_applied_fkey"
            columns: ["promo_applied"]
            isOneToOne: false
            referencedRelation: "perps_promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      perps_user_vip: {
        Row: {
          created_at: string | null
          current_tier: string | null
          effective_fee_bps: number | null
          id: string
          last_calculated_at: string | null
          promo_applied: string | null
          trade_count_30d: number | null
          updated_at: string | null
          volume_30d_usd: number | null
          volume_all_time_usd: number | null
          wallet_address: string
        }
        Insert: {
          created_at?: string | null
          current_tier?: string | null
          effective_fee_bps?: number | null
          id?: string
          last_calculated_at?: string | null
          promo_applied?: string | null
          trade_count_30d?: number | null
          updated_at?: string | null
          volume_30d_usd?: number | null
          volume_all_time_usd?: number | null
          wallet_address: string
        }
        Update: {
          created_at?: string | null
          current_tier?: string | null
          effective_fee_bps?: number | null
          id?: string
          last_calculated_at?: string | null
          promo_applied?: string | null
          trade_count_30d?: number | null
          updated_at?: string | null
          volume_30d_usd?: number | null
          volume_all_time_usd?: number | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "perps_user_vip_current_tier_fkey"
            columns: ["current_tier"]
            isOneToOne: false
            referencedRelation: "perps_fee_tiers"
            referencedColumns: ["tier_name"]
          },
          {
            foreignKeyName: "perps_user_vip_promo_applied_fkey"
            columns: ["promo_applied"]
            isOneToOne: false
            referencedRelation: "perps_promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_history: {
        Row: {
          created_at: string | null
          from_amount: string
          from_token_address: string
          id: string
          timestamp: string
          to_amount: string
          to_token_address: string
          tx_hash: string
          usd_value: number
          wallet_address: string
        }
        Insert: {
          created_at?: string | null
          from_amount: string
          from_token_address: string
          id?: string
          timestamp: string
          to_amount: string
          to_token_address: string
          tx_hash: string
          usd_value: number
          wallet_address: string
        }
        Update: {
          created_at?: string | null
          from_amount?: string
          from_token_address?: string
          id?: string
          timestamp?: string
          to_amount?: string
          to_token_address?: string
          tx_hash?: string
          usd_value?: number
          wallet_address?: string
        }
        Relationships: []
      }
      user_incentives: {
        Row: {
          bridge_count: number | null
          created_at: string | null
          id: string
          nft_minted: boolean | null
          nft_minted_at: string | null
          nft_serial_number: string | null
          nft_token_id: string | null
          swap_count: number | null
          total_bridged_usd: number | null
          total_swapped_usd: number | null
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          bridge_count?: number | null
          created_at?: string | null
          id?: string
          nft_minted?: boolean | null
          nft_minted_at?: string | null
          nft_serial_number?: string | null
          nft_token_id?: string | null
          swap_count?: number | null
          total_bridged_usd?: number | null
          total_swapped_usd?: number | null
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          bridge_count?: number | null
          created_at?: string | null
          id?: string
          nft_minted?: boolean | null
          nft_minted_at?: string | null
          nft_serial_number?: string | null
          nft_token_id?: string | null
          swap_count?: number | null
          total_bridged_usd?: number | null
          total_swapped_usd?: number | null
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      user_mission_claims: {
        Row: {
          claimed_at: string | null
          id: string
          mission_id: string
          nft_serial_number: number
          transaction_id: string
          user_wallet_address: string
        }
        Insert: {
          claimed_at?: string | null
          id?: string
          mission_id: string
          nft_serial_number: number
          transaction_id: string
          user_wallet_address: string
        }
        Update: {
          claimed_at?: string | null
          id?: string
          mission_id?: string
          nft_serial_number?: number
          transaction_id?: string
          user_wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mission_claims_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_user_vip_stats: {
        Args: { p_wallet: string }
        Returns: {
          applied_promo: string
          current_tier_name: string
          effective_fee: number
          trade_count_30d: number
          volume_30d: number
          volume_all_time: number
        }[]
      }
      claim_mission: {
        Args: {
          p_mission_id: string
          p_transaction_id: string
          p_user_wallet: string
        }
        Returns: {
          message: string
          serial_number: number
          success: boolean
        }[]
      }
      get_effective_fee: {
        Args: { p_wallet: string }
        Returns: {
          fee_bps: number
          promo_id: string
          tier_name: string
        }[]
      }
      increment_rate_limits: { Args: { p_user_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
