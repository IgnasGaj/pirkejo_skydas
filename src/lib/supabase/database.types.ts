// Derived from local migrations through 20261002000000_receipt_upload_claims.sql.
// Regenerate against a migrated local database with:
// supabase gen types typescript --local --schema public > src/lib/supabase/database.types.ts
export type Database = {
  public: {
    Tables: {
      purchases: {
        Row: {
          id: string; user_id: string; product_name: string; seller_name: string;
          purchase_date: string; received_date: string | null;
          purchase_channel: "PHYSICAL_STORE" | "DISTANCE" | "UNKNOWN";
          price_cents: number | null; currency: "EUR"; reference_number: string | null;
          notes: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; user_id: string; product_name: string; seller_name: string;
          purchase_date: string; received_date?: string | null;
          purchase_channel: "PHYSICAL_STORE" | "DISTANCE" | "UNKNOWN";
          price_cents?: number | null; currency?: "EUR"; reference_number?: string | null;
          notes?: string | null; created_at?: string; updated_at?: string;
        };
        Update: {
          id?: string; user_id?: string; product_name?: string; seller_name?: string;
          purchase_date?: string; received_date?: string | null;
          purchase_channel?: "PHYSICAL_STORE" | "DISTANCE" | "UNKNOWN";
          price_cents?: number | null; currency?: "EUR"; reference_number?: string | null;
          notes?: string | null; created_at?: string; updated_at?: string;
        };
        Relationships: [];
      };
      purchase_documents: {
        Row: {
          id: string; user_id: string; purchase_id: string;
          document_type: "RECEIPT" | "INVOICE" | "ORDER_CONFIRMATION" | "WARRANTY_DOCUMENT" | "OTHER";
          original_filename: string; storage_path: string; mime_type: string;
          size_bytes: number; created_at: string; upload_state: "PENDING" | "READY";
          content_sha256: string | null; upload_claim_token: string | null; upload_claim_expires_at: string | null;
        };
        Insert: {
          id?: string; user_id: string; purchase_id: string;
          document_type: "RECEIPT" | "INVOICE" | "ORDER_CONFIRMATION" | "WARRANTY_DOCUMENT" | "OTHER";
          original_filename: string; storage_path: string; mime_type: string;
          size_bytes: number; created_at?: string; upload_state?: "PENDING" | "READY";
          content_sha256?: string | null; upload_claim_token?: string | null; upload_claim_expires_at?: string | null;
        };
        Update: {
          id?: string; user_id?: string; purchase_id?: string;
          document_type?: "RECEIPT" | "INVOICE" | "ORDER_CONFIRMATION" | "WARRANTY_DOCUMENT" | "OTHER";
          original_filename?: string; storage_path?: string; mime_type?: string;
          size_bytes?: number; created_at?: string; upload_state?: "PENDING" | "READY";
          content_sha256?: string | null; upload_claim_token?: string | null; upload_claim_expires_at?: string | null;
        };
        Relationships: [{
          foreignKeyName: "purchase_documents_owned_purchase";
          columns: ["purchase_id", "user_id"];
          isOneToOne: false;
          referencedRelation: "purchases";
          referencedColumns: ["id", "user_id"];
        }];
      };
    };
    Views: Record<never, never>;
    Functions: {
      set_purchase_updated_at: { Args: Record<never, never>; Returns: unknown };
      claim_reviewed_receipt: { Args: {
        p_purchase_id: string; p_document_id: string; p_path: string; p_filename: string;
        p_mime: string; p_size: number; p_sha256: string; p_token: string;
      }; Returns: string };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type Row<Table extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][Table]["Row"];
export type Insert<Table extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][Table]["Insert"];
export type Update<Table extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][Table]["Update"];
