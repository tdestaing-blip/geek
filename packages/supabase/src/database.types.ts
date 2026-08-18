export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      auction_bids: {
        Row: {
          amount_minor: number;
          auction_id: string;
          bidder_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          amount_minor: number;
          auction_id: string;
          bidder_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          amount_minor?: number;
          auction_id?: string;
          bidder_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "auction_bids_auction_id_foreign_key";
            columns: ["auction_id"];
            isOneToOne: false;
            referencedRelation: "auctions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "auction_bids_bidder_id_foreign_key";
            columns: ["bidder_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      auction_private_details: {
        Row: {
          auction_id: string;
          created_at: string;
          reserve_amount_minor: number | null;
          updated_at: string;
        };
        Insert: {
          auction_id: string;
          created_at?: string;
          reserve_amount_minor?: number | null;
          updated_at?: string;
        };
        Update: {
          auction_id?: string;
          created_at?: string;
          reserve_amount_minor?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "auction_private_details_auction_id_fkey";
            columns: ["auction_id"];
            isOneToOne: true;
            referencedRelation: "auctions";
            referencedColumns: ["id"];
          },
        ];
      };
      auctions: {
        Row: {
          bid_count: number;
          copy_id: string;
          created_at: string;
          currency: string;
          current_amount_minor: number | null;
          ends_at: string | null;
          id: string;
          leading_bid_id: string | null;
          local_pickup: boolean;
          min_increment_minor: number;
          seller_id: string;
          shipping_available: boolean;
          starting_amount_minor: number;
          starts_at: string | null;
          status: string;
          updated_at: string;
          winning_bid_id: string | null;
        };
        Insert: {
          bid_count?: number;
          copy_id: string;
          created_at?: string;
          currency: string;
          current_amount_minor?: number | null;
          ends_at?: string | null;
          id?: string;
          leading_bid_id?: string | null;
          local_pickup?: boolean;
          min_increment_minor: number;
          seller_id: string;
          shipping_available?: boolean;
          starting_amount_minor: number;
          starts_at?: string | null;
          status?: string;
          updated_at?: string;
          winning_bid_id?: string | null;
        };
        Update: {
          bid_count?: number;
          copy_id?: string;
          created_at?: string;
          currency?: string;
          current_amount_minor?: number | null;
          ends_at?: string | null;
          id?: string;
          leading_bid_id?: string | null;
          local_pickup?: boolean;
          min_increment_minor?: number;
          seller_id?: string;
          shipping_available?: boolean;
          starting_amount_minor?: number;
          starts_at?: string | null;
          status?: string;
          updated_at?: string;
          winning_bid_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "auctions_copy_id_foreign_key";
            columns: ["copy_id"];
            isOneToOne: false;
            referencedRelation: "copies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "auctions_leading_bid_foreign_key";
            columns: ["leading_bid_id", "id"];
            isOneToOne: false;
            referencedRelation: "auction_bids";
            referencedColumns: ["id", "auction_id"];
          },
          {
            foreignKeyName: "auctions_seller_id_foreign_key";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "auctions_winning_bid_foreign_key";
            columns: ["winning_bid_id", "id"];
            isOneToOne: false;
            referencedRelation: "auction_bids";
            referencedColumns: ["id", "auction_id"];
          },
        ];
      };
      catalog_import_runs: {
        Row: {
          completed_at: string;
          dry_run: boolean;
          id: string;
          platform_id: string;
          provider: string;
          provider_revision: string;
          started_at: string;
          status: string;
          summary: Json;
        };
        Insert: {
          completed_at: string;
          dry_run?: boolean;
          id?: string;
          platform_id: string;
          provider: string;
          provider_revision: string;
          started_at: string;
          status: string;
          summary: Json;
        };
        Update: {
          completed_at?: string;
          dry_run?: boolean;
          id?: string;
          platform_id?: string;
          provider?: string;
          provider_revision?: string;
          started_at?: string;
          status?: string;
          summary?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_import_runs_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_media: {
        Row: {
          asset_url: string;
          attribution: string | null;
          created_at: string;
          edition_id: string | null;
          game_id: string | null;
          height: number | null;
          id: string;
          is_primary: boolean;
          kind: string;
          license_name: string | null;
          license_url: string | null;
          rights_status: string;
          source_asset_id: string | null;
          source_page_url: string | null;
          source_provider: string;
          updated_at: string;
          width: number | null;
        };
        Insert: {
          asset_url: string;
          attribution?: string | null;
          created_at?: string;
          edition_id?: string | null;
          game_id?: string | null;
          height?: number | null;
          id?: string;
          is_primary?: boolean;
          kind: string;
          license_name?: string | null;
          license_url?: string | null;
          rights_status: string;
          source_asset_id?: string | null;
          source_page_url?: string | null;
          source_provider: string;
          updated_at?: string;
          width?: number | null;
        };
        Update: {
          asset_url?: string;
          attribution?: string | null;
          created_at?: string;
          edition_id?: string | null;
          game_id?: string | null;
          height?: number | null;
          id?: string;
          is_primary?: boolean;
          kind?: string;
          license_name?: string | null;
          license_url?: string | null;
          rights_status?: string;
          source_asset_id?: string | null;
          source_page_url?: string | null;
          source_provider?: string;
          updated_at?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_media_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "catalog_media_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_messages: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          id: string;
          sender_id: string;
        };
        Insert: {
          body: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          sender_id: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_trade_offers: {
        Row: {
          conversation_id: string;
          created_at: string;
          linked_by_user_id: string;
          trade_offer_id: string;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          linked_by_user_id: string;
          trade_offer_id: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          linked_by_user_id?: string;
          trade_offer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_trade_offers_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_trade_offers_linked_by_user_id_fkey";
            columns: ["linked_by_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_trade_offers_trade_offer_id_fkey";
            columns: ["trade_offer_id"];
            isOneToOne: true;
            referencedRelation: "trade_offers";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          participant_high_id: string;
          participant_low_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          participant_high_id: string;
          participant_low_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          participant_high_id?: string;
          participant_low_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_participant_high_id_fkey";
            columns: ["participant_high_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_participant_low_id_fkey";
            columns: ["participant_low_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      copies: {
        Row: {
          availability: string;
          created_at: string;
          edition_id: string | null;
          game_id: string;
          id: string;
          owner_id: string;
          trade_availability: string;
          updated_at: string;
          visibility: string;
        };
        Insert: {
          availability?: string;
          created_at?: string;
          edition_id?: string | null;
          game_id: string;
          id?: string;
          owner_id: string;
          trade_availability?: string;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          availability?: string;
          created_at?: string;
          edition_id?: string | null;
          game_id?: string;
          id?: string;
          owner_id?: string;
          trade_availability?: string;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "copies_edition_game_foreign_key";
            columns: ["edition_id", "game_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id", "game_id"];
          },
          {
            foreignKeyName: "copies_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "copies_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "copies_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      copy_commercial_commitments: {
        Row: {
          auction_id: string | null;
          copy_id: string;
          created_at: string;
          kind: string;
          listing_id: string | null;
          trade_offer_id: string | null;
        };
        Insert: {
          auction_id?: string | null;
          copy_id: string;
          created_at?: string;
          kind: string;
          listing_id?: string | null;
          trade_offer_id?: string | null;
        };
        Update: {
          auction_id?: string | null;
          copy_id?: string;
          created_at?: string;
          kind?: string;
          listing_id?: string | null;
          trade_offer_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "copy_commercial_commitments_auction_copy_foreign_key";
            columns: ["auction_id", "copy_id"];
            isOneToOne: false;
            referencedRelation: "auctions";
            referencedColumns: ["id", "copy_id"];
          },
          {
            foreignKeyName: "copy_commercial_commitments_copy_id_fkey";
            columns: ["copy_id"];
            isOneToOne: true;
            referencedRelation: "copies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "copy_commercial_commitments_listing_copy_foreign_key";
            columns: ["listing_id", "copy_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id", "copy_id"];
          },
          {
            foreignKeyName: "copy_commercial_commitments_trade_offer_copy_foreign_key";
            columns: ["trade_offer_id", "copy_id"];
            isOneToOne: false;
            referencedRelation: "trade_offer_copies";
            referencedColumns: ["trade_offer_id", "copy_id"];
          },
        ];
      };
      copy_component_states: {
        Row: {
          condition_grade: number | null;
          condition_notes: string | null;
          copy_id: string;
          created_at: string;
          edition_component_id: string;
          edition_id: string;
          presence: string;
          updated_at: string;
        };
        Insert: {
          condition_grade?: number | null;
          condition_notes?: string | null;
          copy_id: string;
          created_at?: string;
          edition_component_id: string;
          edition_id: string;
          presence?: string;
          updated_at?: string;
        };
        Update: {
          condition_grade?: number | null;
          condition_notes?: string | null;
          copy_id?: string;
          created_at?: string;
          edition_component_id?: string;
          edition_id?: string;
          presence?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "copy_component_states_component_edition_foreign_key";
            columns: ["edition_component_id", "edition_id"];
            isOneToOne: false;
            referencedRelation: "edition_components";
            referencedColumns: ["id", "edition_id"];
          },
          {
            foreignKeyName: "copy_component_states_copy_edition_foreign_key";
            columns: ["copy_id", "edition_id"];
            isOneToOne: false;
            referencedRelation: "copies";
            referencedColumns: ["id", "edition_id"];
          },
        ];
      };
      copy_private_details: {
        Row: {
          acquired_at: string | null;
          copy_id: string;
          created_at: string;
          owner_id: string;
          private_notes: string | null;
          provenance: string | null;
          purchase_amount_minor: number | null;
          purchase_currency: string | null;
          storage_location: string | null;
          updated_at: string;
        };
        Insert: {
          acquired_at?: string | null;
          copy_id: string;
          created_at?: string;
          owner_id: string;
          private_notes?: string | null;
          provenance?: string | null;
          purchase_amount_minor?: number | null;
          purchase_currency?: string | null;
          storage_location?: string | null;
          updated_at?: string;
        };
        Update: {
          acquired_at?: string | null;
          copy_id?: string;
          created_at?: string;
          owner_id?: string;
          private_notes?: string | null;
          provenance?: string | null;
          purchase_amount_minor?: number | null;
          purchase_currency?: string | null;
          storage_location?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "copy_private_details_copy_id_fkey";
            columns: ["copy_id"];
            isOneToOne: false;
            referencedRelation: "copies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "copy_private_details_owner_id_foreign_key";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      edition_components: {
        Row: {
          component_key: string;
          created_at: string;
          edition_id: string;
          id: string;
          kind: string;
          name: string;
          required_for_complete: boolean;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          component_key: string;
          created_at?: string;
          edition_id: string;
          id?: string;
          kind: string;
          name: string;
          required_for_complete?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          component_key?: string;
          created_at?: string;
          edition_id?: string;
          id?: string;
          kind?: string;
          name?: string;
          required_for_complete?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edition_components_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          },
        ];
      };
      edition_identifiers: {
        Row: {
          authority: string | null;
          created_at: string;
          edition_id: string;
          id: string;
          scheme: string;
          value: string;
        };
        Insert: {
          authority?: string | null;
          created_at?: string;
          edition_id: string;
          id?: string;
          scheme: string;
          value: string;
        };
        Update: {
          authority?: string | null;
          created_at?: string;
          edition_id?: string;
          id?: string;
          scheme?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edition_identifiers_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          },
        ];
      };
      edition_provider_mappings: {
        Row: {
          created_at: string;
          edition_id: string;
          external_id: string;
          provider: string;
          source_title: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          edition_id: string;
          external_id: string;
          provider: string;
          source_title?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          edition_id?: string;
          external_id?: string;
          provider?: string;
          source_title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edition_provider_mappings_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          },
        ];
      };
      editions: {
        Row: {
          created_at: string;
          edition_name: string | null;
          game_id: string;
          id: string;
          packaging_type: string | null;
          platform_id: string;
          publisher_name: string | null;
          region_code: string | null;
          release_date: string | null;
          supported_languages: string[];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          edition_name?: string | null;
          game_id: string;
          id?: string;
          packaging_type?: string | null;
          platform_id: string;
          publisher_name?: string | null;
          region_code?: string | null;
          release_date?: string | null;
          supported_languages?: string[];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          edition_name?: string | null;
          game_id?: string;
          id?: string;
          packaging_type?: string | null;
          platform_id?: string;
          publisher_name?: string | null;
          region_code?: string | null;
          release_date?: string | null;
          supported_languages?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "editions_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "editions_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          created_at: string;
          followed_id: string;
          follower_id: string;
        };
        Insert: {
          created_at?: string;
          followed_id: string;
          follower_id: string;
        };
        Update: {
          created_at?: string;
          followed_id?: string;
          follower_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_followed_foreign_key";
            columns: ["followed_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_follower_foreign_key";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      game_provider_mappings: {
        Row: {
          created_at: string;
          external_id: string;
          game_id: string;
          provider: string;
          source_title: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          external_id: string;
          game_id: string;
          provider: string;
          source_title?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          external_id?: string;
          game_id?: string;
          provider?: string;
          source_title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_provider_mappings_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      games: {
        Row: {
          canonical_title: string;
          created_at: string;
          description: string | null;
          id: string;
          original_release_date: string | null;
          updated_at: string;
        };
        Insert: {
          canonical_title: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          original_release_date?: string | null;
          updated_at?: string;
        };
        Update: {
          canonical_title?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          original_release_date?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      listings: {
        Row: {
          asking_amount_minor: number;
          asking_currency: string;
          copy_id: string;
          created_at: string;
          id: string;
          local_pickup: boolean;
          published_at: string | null;
          seller_id: string;
          shipping_available: boolean;
          status: string;
          updated_at: string;
        };
        Insert: {
          asking_amount_minor: number;
          asking_currency: string;
          copy_id: string;
          created_at?: string;
          id?: string;
          local_pickup?: boolean;
          published_at?: string | null;
          seller_id: string;
          shipping_available?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          asking_amount_minor?: number;
          asking_currency?: string;
          copy_id?: string;
          created_at?: string;
          id?: string;
          local_pickup?: boolean;
          published_at?: string | null;
          seller_id?: string;
          shipping_available?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listings_copy_id_foreign_key";
            columns: ["copy_id"];
            isOneToOne: false;
            referencedRelation: "copies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_seller_id_foreign_key";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      platforms: {
        Row: {
          created_at: string;
          id: string;
          manufacturer: string | null;
          name: string;
          released_at: string | null;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          manufacturer?: string | null;
          name: string;
          released_at?: string | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          manufacturer?: string | null;
          name?: string;
          released_at?: string | null;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          avatar_path?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          avatar_path?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      trade_completion_confirmations: {
        Row: {
          confirmed_at: string;
          trade_offer_id: string;
          user_id: string;
        };
        Insert: {
          confirmed_at?: string;
          trade_offer_id: string;
          user_id: string;
        };
        Update: {
          confirmed_at?: string;
          trade_offer_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trade_completion_confirmations_trade_offer_id_fkey";
            columns: ["trade_offer_id"];
            isOneToOne: false;
            referencedRelation: "trade_offers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trade_completion_confirmations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      trade_completions: {
        Row: {
          completed_at: string;
          id: string;
          trade_offer_id: string;
        };
        Insert: {
          completed_at?: string;
          id?: string;
          trade_offer_id: string;
        };
        Update: {
          completed_at?: string;
          id?: string;
          trade_offer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trade_completions_trade_offer_id_fkey";
            columns: ["trade_offer_id"];
            isOneToOne: true;
            referencedRelation: "trade_offers";
            referencedColumns: ["id"];
          },
        ];
      };
      trade_offer_copies: {
        Row: {
          copy_id: string;
          created_at: string;
          side: string;
          trade_offer_id: string;
        };
        Insert: {
          copy_id: string;
          created_at?: string;
          side: string;
          trade_offer_id: string;
        };
        Update: {
          copy_id?: string;
          created_at?: string;
          side?: string;
          trade_offer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trade_offer_copies_copy_id_fkey";
            columns: ["copy_id"];
            isOneToOne: false;
            referencedRelation: "copies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trade_offer_copies_trade_offer_id_fkey";
            columns: ["trade_offer_id"];
            isOneToOne: false;
            referencedRelation: "trade_offers";
            referencedColumns: ["id"];
          },
        ];
      };
      trade_offers: {
        Row: {
          cash_amount_minor: number | null;
          cash_currency: string | null;
          cash_direction: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          proposer_id: string;
          recipient_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          cash_amount_minor?: number | null;
          cash_currency?: string | null;
          cash_direction?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          proposer_id: string;
          recipient_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          cash_amount_minor?: number | null;
          cash_currency?: string | null;
          cash_direction?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          proposer_id?: string;
          recipient_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trade_offers_proposer_id_fkey";
            columns: ["proposer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trade_offers_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_discovery_locations: {
        Row: {
          accuracy_meters: number | null;
          confirmed_at: string | null;
          created_at: string;
          location: unknown;
          source: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accuracy_meters?: number | null;
          confirmed_at?: string | null;
          created_at?: string;
          location: unknown;
          source: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accuracy_meters?: number | null;
          confirmed_at?: string | null;
          created_at?: string;
          location?: unknown;
          source?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_discovery_locations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      wishlist_intent_private_details: {
        Row: {
          created_at: string;
          max_purchase_amount_minor: number | null;
          max_purchase_currency: string | null;
          max_trade_distance_km: number | null;
          priority: number;
          private_notes: string | null;
          updated_at: string;
          wishlist_intent_id: string;
        };
        Insert: {
          created_at?: string;
          max_purchase_amount_minor?: number | null;
          max_purchase_currency?: string | null;
          max_trade_distance_km?: number | null;
          priority?: number;
          private_notes?: string | null;
          updated_at?: string;
          wishlist_intent_id: string;
        };
        Update: {
          created_at?: string;
          max_purchase_amount_minor?: number | null;
          max_purchase_currency?: string | null;
          max_trade_distance_km?: number | null;
          priority?: number;
          private_notes?: string | null;
          updated_at?: string;
          wishlist_intent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wishlist_private_details_wishlist_item_id_fkey";
            columns: ["wishlist_intent_id"];
            isOneToOne: true;
            referencedRelation: "wishlist_intents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlist_private_details_wishlist_item_id_fkey";
            columns: ["wishlist_intent_id"];
            isOneToOne: true;
            referencedRelation: "wishlist_items";
            referencedColumns: ["id"];
          },
        ];
      };
      wishlist_intents: {
        Row: {
          completeness_preference: string;
          created_at: string;
          edition_id: string | null;
          game_id: string;
          id: string;
          minimum_component_condition_grade: number | null;
          owner_id: string;
          preferred_region_code: string | null;
          purchase_interest: boolean;
          status: string;
          trade_interest: boolean;
          updated_at: string;
          visibility: string;
        };
        Insert: {
          completeness_preference?: string;
          created_at?: string;
          edition_id?: string | null;
          game_id: string;
          id?: string;
          minimum_component_condition_grade?: number | null;
          owner_id: string;
          preferred_region_code?: string | null;
          purchase_interest?: boolean;
          status?: string;
          trade_interest?: boolean;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          completeness_preference?: string;
          created_at?: string;
          edition_id?: string | null;
          game_id?: string;
          id?: string;
          minimum_component_condition_grade?: number | null;
          owner_id?: string;
          preferred_region_code?: string | null;
          purchase_interest?: boolean;
          status?: string;
          trade_interest?: boolean;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wishlist_intents_edition_game_foreign_key";
            columns: ["edition_id", "game_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id", "game_id"];
          },
          {
            foreignKeyName: "wishlist_items_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlist_items_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlist_items_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      wishlist_items: {
        Row: {
          created_at: string | null;
          edition_id: string | null;
          game_id: string | null;
          id: string | null;
          owner_id: string | null;
          purchase_interest: boolean | null;
          status: string | null;
          trade_interest: boolean | null;
          updated_at: string | null;
          visibility: string | null;
        };
        Insert: {
          created_at?: string | null;
          edition_id?: string | null;
          game_id?: never;
          id?: string | null;
          owner_id?: string | null;
          purchase_interest?: boolean | null;
          status?: string | null;
          trade_interest?: boolean | null;
          updated_at?: string | null;
          visibility?: string | null;
        };
        Update: {
          created_at?: string | null;
          edition_id?: string | null;
          game_id?: never;
          id?: string | null;
          owner_id?: string | null;
          purchase_interest?: boolean | null;
          status?: string | null;
          trade_interest?: boolean | null;
          updated_at?: string | null;
          visibility?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "wishlist_items_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlist_items_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      wishlist_private_details: {
        Row: {
          created_at: string | null;
          max_purchase_amount_minor: number | null;
          max_purchase_currency: string | null;
          max_trade_distance_km: number | null;
          priority: number | null;
          private_notes: string | null;
          updated_at: string | null;
          wishlist_item_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          max_purchase_amount_minor?: number | null;
          max_purchase_currency?: string | null;
          max_trade_distance_km?: number | null;
          priority?: number | null;
          private_notes?: string | null;
          updated_at?: string | null;
          wishlist_item_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          max_purchase_amount_minor?: number | null;
          max_purchase_currency?: string | null;
          max_trade_distance_km?: number | null;
          priority?: number | null;
          private_notes?: string | null;
          updated_at?: string | null;
          wishlist_item_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "wishlist_private_details_wishlist_item_id_fkey";
            columns: ["wishlist_item_id"];
            isOneToOne: true;
            referencedRelation: "wishlist_intents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlist_private_details_wishlist_item_id_fkey";
            columns: ["wishlist_item_id"];
            isOneToOne: true;
            referencedRelation: "wishlist_items";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      accept_trade_offer: {
        Args: { target_trade_offer_id: string };
        Returns: undefined;
      };
      cancel_trade_offer: {
        Args: { target_trade_offer_id: string };
        Returns: undefined;
      };
      confirm_trade_completion: {
        Args: { target_trade_offer_id: string };
        Returns: {
          caller_confirmed_at: string;
          completed: boolean;
          completed_at: string;
          counterpart_confirmed: boolean;
          trade_completion_id: string;
          trade_offer_id: string;
        }[];
      };
      create_trade_offer: {
        Args: {
          cash_amount_minor?: number;
          cash_currency?: string;
          cash_direction?: string;
          expires_at?: string;
          offered_copy_ids: string[];
          recipient_user_id: string;
          requested_copy_ids: string[];
        };
        Returns: string;
      };
      decline_trade_offer: {
        Args: { target_trade_offer_id: string };
        Returns: undefined;
      };
      derive_matching_location: {
        Args: { exact_location: unknown };
        Returns: unknown;
      };
      distance_from_me_to_user: {
        Args: { target_user_id: string };
        Returns: number;
      };
      expire_trade_offer: {
        Args: { target_trade_offer_id: string };
        Returns: undefined;
      };
      finalize_auction: {
        Args: { target_auction_id: string };
        Returns: {
          bid_count: number;
          copy_id: string;
          created_at: string;
          currency: string;
          current_amount_minor: number | null;
          ends_at: string | null;
          id: string;
          leading_bid_id: string | null;
          local_pickup: boolean;
          min_increment_minor: number;
          seller_id: string;
          shipping_available: boolean;
          starting_amount_minor: number;
          starts_at: string | null;
          status: string;
          updated_at: string;
          winning_bid_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "auctions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_auction_discovery: {
        Args: {
          result_limit?: number;
          result_offset?: number;
          target_edition_id?: string;
          target_game_id: string;
        };
        Returns: {
          auction_id: string;
          bid_count: number;
          copy_id: string;
          currency: string;
          current_amount_minor: number;
          edition_id: string;
          ends_at: string;
          game_id: string;
          local_pickup: boolean;
          min_increment_minor: number;
          phase: string;
          seller_id: string;
          shipping_available: boolean;
          starting_amount_minor: number;
          starts_at: string;
        }[];
      };
      get_buy_discovery: {
        Args: {
          result_limit?: number;
          result_offset?: number;
          target_edition_id?: string;
          target_game_id: string;
        };
        Returns: {
          asking_amount_minor: number;
          asking_currency: string;
          copy_id: string;
          edition_id: string;
          game_id: string;
          listing_id: string;
          local_pickup: boolean;
          published_at: string;
          seller_id: string;
          shipping_available: boolean;
        }[];
      };
      get_collector_discovery: {
        Args: {
          result_limit?: number;
          result_offset?: number;
          target_edition_id?: string;
          target_game_id: string;
        };
        Returns: {
          copy_id: string;
          edition_id: string;
          game_id: string;
          owner_id: string;
        }[];
      };
      get_discovery_summary: {
        Args: { target_edition_id?: string; target_game_id: string };
        Returns: {
          auction_live_count: number;
          auction_local_pickup_count: number;
          auction_shipping_count: number;
          auction_upcoming_count: number;
          buy_count: number;
          buy_local_pickup_count: number;
          buy_shipping_count: number;
          collector_count: number;
          trade_count: number;
        }[];
      };
      get_my_discovery_location: {
        Args: never;
        Returns: {
          accuracy_meters: number;
          confirmed_at: string;
          latitude: number;
          longitude: number;
          source: string;
          updated_at: string;
        }[];
      };
      get_reciprocal_trade_matches: {
        Args: {
          max_distance_km?: number;
          result_limit?: number;
          result_offset?: number;
        };
        Returns: {
          counterpart_user_id: string;
          distance_bucket: string;
          my_active_trade_want_count: number;
          my_matching_copies: Json;
          my_want_match_count: number;
          their_matching_copies: Json;
          their_want_match_count: number;
        }[];
      };
      get_trade_discovery: {
        Args: {
          result_limit?: number;
          result_offset?: number;
          target_edition_id?: string;
          target_game_id: string;
        };
        Returns: {
          copy_id: string;
          edition_id: string;
          game_id: string;
          owner_id: string;
        }[];
      };
      import_catalog_batch: {
        Args: {
          import_summary: Json;
          normalized_games: Json;
          platform_manufacturer: string;
          platform_name: string;
          platform_slug: string;
          provider_name: string;
          provider_revision: string;
        };
        Returns: Json;
      };
      link_trade_offer_to_conversation: {
        Args: { target_conversation_id: string; target_trade_offer_id: string };
        Returns: string;
      };
      place_auction_bid: {
        Args: { bid_amount_minor: number; target_auction_id: string };
        Returns: {
          accepted_amount_minor: number;
          auction_id: string;
          bid_count: number;
          bid_id: string;
          created_at: string;
          current_amount_minor: number;
        }[];
      };
      search_catalog: {
        Args: {
          result_limit?: number;
          result_offset?: number;
          search_query: string;
        };
        Returns: {
          edition_id: string;
          entity_id: string;
          game_id: string;
          platform_id: string;
          primary_title: string;
          relevance_score: number;
          result_kind: string;
          secondary_label: string;
        }[];
      };
      send_conversation_message: {
        Args: { message_body: string; target_conversation_id: string };
        Returns: string;
      };
      send_direct_message: {
        Args: { message_body: string; recipient_user_id: string };
        Returns: {
          conversation_id: string;
          message_id: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
