// Maintained from local migrations through 20261003070000_terminal_evidence_deletion.sql.
// Regenerate against a migrated local database with:
// supabase gen types typescript --local --schema public > src/lib/supabase/database.types.ts
export type Database = {
  public: {
    Tables: {
      complaints: {
        Row: { id: string; user_id: string; purchase_id: string; family: "DEFECTIVE_PRODUCT" | "DISTANCE_WITHDRAWAL" | "PHYSICAL_RETURN_REQUEST"; request_id: string; answers: Json; facts: Json; remedy: string; purchase_updated_at: string; template_version: string; source_version: string; draft_version: number; last_save_request_id: string | null; last_save_hash: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; purchase_id: string; family: "DEFECTIVE_PRODUCT" | "DISTANCE_WITHDRAWAL" | "PHYSICAL_RETURN_REQUEST"; request_id: string; answers: Json; facts: Json; remedy: string; purchase_updated_at: string; template_version: string; source_version: string; draft_version?: number; last_save_request_id?: string | null; last_save_hash?: string | null; created_at?: string; updated_at?: string };
        Update: { family?: "DEFECTIVE_PRODUCT" | "DISTANCE_WITHDRAWAL" | "PHYSICAL_RETURN_REQUEST"; answers?: Json; facts?: Json; remedy?: string; purchase_updated_at?: string; template_version?: string; source_version?: string; last_save_request_id?: string | null; last_save_hash?: string | null };
        Relationships: [];
      };
      complaint_versions: {
        Row: { id: string; user_id: string; purchase_id: string; complaint_id: string; version_no: number; request_id: string; document_date: string; snapshot: Json; sections: Json; plain_text: string; template_version: string; source_version: string; generated_at: string };
        Insert: { id?: string; user_id: string; purchase_id: string; complaint_id: string; version_no: number; request_id: string; document_date: string; snapshot: Json; sections: Json; plain_text: string; template_version: string; source_version: string; generated_at?: string };
        Update: Record<never, never>;
        Relationships: [];
      };
      purchases: {
        Row: {
          id: string; user_id: string; product_name: string; seller_name: string;
          purchase_date: string; received_date: string | null;
          purchase_channel: "PHYSICAL_STORE" | "DISTANCE" | "UNKNOWN";
          price_cents: number | null; currency: "EUR"; reference_number: string | null;
          notes: string | null; created_at: string; updated_at: string; deletion_state: "ACTIVE" | "DELETING";
        };
        Insert: {
          id?: string; user_id: string; product_name: string; seller_name: string;
          purchase_date: string; received_date?: string | null;
          purchase_channel: "PHYSICAL_STORE" | "DISTANCE" | "UNKNOWN";
          price_cents?: number | null; currency?: "EUR"; reference_number?: string | null;
          notes?: string | null; created_at?: string; updated_at?: string; deletion_state?: "ACTIVE" | "DELETING";
        };
        Update: {
          id?: string; user_id?: string; product_name?: string; seller_name?: string;
          purchase_date?: string; received_date?: string | null;
          purchase_channel?: "PHYSICAL_STORE" | "DISTANCE" | "UNKNOWN";
          price_cents?: number | null; currency?: "EUR"; reference_number?: string | null;
          notes?: string | null; created_at?: string; updated_at?: string; deletion_state?: "ACTIVE" | "DELETING";
        };
        Relationships: [];
      };
      purchase_documents: {
        Row: {
          id: string; user_id: string; purchase_id: string;
          document_type: "RECEIPT" | "INVOICE" | "ORDER_CONFIRMATION" | "WARRANTY_DOCUMENT" | "OTHER";
          original_filename: string; storage_path: string; mime_type: string;
          size_bytes: number; created_at: string; upload_state: "PENDING" | "READY" | "DELETING";
          content_sha256: string | null; upload_claim_token: string | null; upload_claim_expires_at: string | null;
        };
        Insert: {
          id?: string; user_id: string; purchase_id: string;
          document_type: "RECEIPT" | "INVOICE" | "ORDER_CONFIRMATION" | "WARRANTY_DOCUMENT" | "OTHER";
          original_filename: string; storage_path: string; mime_type: string;
          size_bytes: number; created_at?: string; upload_state?: "PENDING" | "READY" | "DELETING";
          content_sha256?: string | null; upload_claim_token?: string | null; upload_claim_expires_at?: string | null;
        };
        Update: {
          id?: string; user_id?: string; purchase_id?: string;
          document_type?: "RECEIPT" | "INVOICE" | "ORDER_CONFIRMATION" | "WARRANTY_DOCUMENT" | "OTHER";
          original_filename?: string; storage_path?: string; mime_type?: string;
          size_bytes?: number; created_at?: string; upload_state?: "PENDING" | "READY" | "DELETING";
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
      save_reviewed_complaint: { Args: { p_complaint_id: string; p_expected_version: number; p_purchase_updated_at: string; p_rebind: boolean; p_request_id: string; p_family: string; p_answers: Json; p_facts: Json; p_remedy: string; p_template_version: string; p_source_version: string }; Returns: Database["public"]["Tables"]["complaints"]["Row"] };
      generate_signed_complaint_version: { Args: { p_payload: string; p_signature: string }; Returns: Database["public"]["Tables"]["complaint_versions"]["Row"] };
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

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Row<Table extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][Table]["Row"];
export type Insert<Table extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][Table]["Insert"];
export type Update<Table extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][Table]["Update"];
