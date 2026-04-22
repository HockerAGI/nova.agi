import type { JsonObject } from "../types.js";

type EmptySchemaObject = Record<string, never>;

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          name: string | null;
          meta: JsonObject | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          meta?: JsonObject | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          name: string | null;
          meta: JsonObject | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      project_members: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          role: "owner" | "admin" | "operator" | "viewer";
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          role?: "owner" | "admin" | "operator" | "viewer";
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          user_id: string;
          role: "owner" | "admin" | "operator" | "viewer";
          created_at: string;
        }>;
        Relationships: [];
      };

      nodes: {
        Row: {
          id: string;
          project_id: string;
          name: string | null;
          type: string;
          status: string;
          last_seen_at: string | null;
          meta: JsonObject | null;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          name?: string | null;
          type?: string;
          status?: string;
          last_seen_at?: string | null;
          meta?: JsonObject | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          name: string | null;
          type: string;
          status: string;
          last_seen_at: string | null;
          meta: JsonObject | null;
          tags: string[];
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };

      system_controls: {
        Row: {
          project_id: string;
          id: string;
          kill_switch: boolean;
          allow_write: boolean;
          meta: JsonObject | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          id?: string;
          kill_switch?: boolean;
          allow_write?: boolean;
          meta?: JsonObject | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          project_id: string;
          id: string;
          kill_switch: boolean;
          allow_write: boolean;
          meta: JsonObject | null;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };

      commands: {
        Row: {
          id: string;
          project_id: string;
          node_id: string | null;
          command: string;
          payload: JsonObject | null;
          status: "queued" | "needs_approval" | "running" | "done" | "error" | "canceled";
          needs_approval: boolean;
          signature: string;
          result: JsonObject | null;
          error: string | null;
          created_at: string;
          executed_at: string | null;
          started_at: string | null;
          finished_at: string | null;
          approved_at: string | null;
        };
        Insert: {
          id: string;
          project_id: string;
          node_id?: string | null;
          command: string;
          payload?: JsonObject | null;
          status?: "queued" | "needs_approval" | "running" | "done" | "error" | "canceled";
          needs_approval?: boolean;
          signature: string;
          result?: JsonObject | null;
          error?: string | null;
          created_at?: string;
          executed_at?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          approved_at?: string | null;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          node_id: string | null;
          command: string;
          payload: JsonObject | null;
          status: "queued" | "needs_approval" | "running" | "done" | "error" | "canceled";
          needs_approval: boolean;
          signature: string;
          result: JsonObject | null;
          error: string | null;
          created_at: string;
          executed_at: string | null;
          started_at: string | null;
          finished_at: string | null;
          approved_at: string | null;
        }>;
        Relationships: [];
      };

      events: {
        Row: {
          id: string;
          project_id: string;
          node_id: string | null;
          level: "info" | "warn" | "error";
          type: string;
          message: string;
          data: JsonObject | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          node_id?: string | null;
          level?: "info" | "warn" | "error";
          type: string;
          message: string;
          data?: JsonObject | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          node_id: string | null;
          level: "info" | "warn" | "error";
          type: string;
          message: string;
          data: JsonObject | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      audit_logs: {
        Row: {
          id: string;
          project_id: string | null;
          actor_user_id: string | null;
          action: string;
          context: JsonObject | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          actor_user_id?: string | null;
          action: string;
          context?: JsonObject | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          project_id: string | null;
          actor_user_id: string | null;
          action: string;
          context: JsonObject | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      agis: {
        Row: {
          id: string;
          name: string | null;
          description: string | null;
          version: string | null;
          tags: string[];
          meta: JsonObject | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          description?: string | null;
          version?: string | null;
          tags?: string[];
          meta?: JsonObject | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          name: string | null;
          description: string | null;
          version: string | null;
          tags: string[];
          meta: JsonObject | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      nova_threads: {
        Row: {
          id: string;
          project_id: string;
          user_id: string | null;
          title: string | null;
          created_at: string;
          summary?: string | null;
          meta?: JsonObject | null;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id?: string | null;
          title?: string | null;
          created_at?: string;
          summary?: string | null;
          meta?: JsonObject | null;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          user_id: string | null;
          title: string | null;
          created_at: string;
          summary?: string | null;
          meta?: JsonObject | null;
          updated_at?: string;
        }>;
        Relationships: [];
      };

      nova_messages: {
        Row: {
          id: string;
          project_id: string;
          thread_id: string;
          role: "system" | "user" | "assistant" | "nova";
          content: string;
          created_at: string;
          meta?: JsonObject | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          thread_id: string;
          role: "system" | "user" | "assistant" | "nova";
          content: string;
          created_at?: string;
          meta?: JsonObject | null;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          thread_id: string;
          role: "system" | "user" | "assistant" | "nova";
          content: string;
          created_at: string;
          meta?: JsonObject | null;
        }>;
        Relationships: [];
      };

      llm_usage: {
        Row: {
          id: string;
          project_id: string;
          provider: string;
          model: string | null;
          tokens_in: number | null;
          tokens_out: number | null;
          cost_usd: number | null;
          meta: JsonObject | null;
          created_at: string;
          thread_id?: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          provider: string;
          model?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          cost_usd?: number | null;
          meta?: JsonObject | null;
          created_at?: string;
          thread_id?: string | null;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          provider: string;
          model: string | null;
          tokens_in: number | null;
          tokens_out: number | null;
          cost_usd: number | null;
          meta: JsonObject | null;
          created_at: string;
          thread_id?: string | null;
        }>;
        Relationships: [];
      };

      audit_exports: {
        Row: {
          id: string;
          project_id: string;
          export_type: string;
          scope: JsonObject | null;
          file_name: string;
          file_path: string;
          content_hash: string;
          chain_fingerprint: string | null;
          seal_token: string | null;
          seal_signature: string | null;
          sealed_at: string;
          expires_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          export_type: string;
          scope?: JsonObject | null;
          file_name: string;
          file_path: string;
          content_hash: string;
          chain_fingerprint?: string | null;
          seal_token?: string | null;
          seal_signature?: string | null;
          sealed_at: string;
          expires_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          export_type: string;
          scope: JsonObject | null;
          file_name: string;
          file_path: string;
          content_hash: string;
          chain_fingerprint: string | null;
          seal_token: string | null;
          seal_signature: string | null;
          sealed_at: string;
          expires_at: string | null;
          created_by: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };
    };

    Views: EmptySchemaObject;
    Functions: EmptySchemaObject;
    Enums: EmptySchemaObject;
    CompositeTypes: EmptySchemaObject;
  };
};
