import type { JsonObject } from "../types.js";

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
      };

      /**
       * Compat bridge: tablas legacy aún referenciadas por archivos viejos del repo.
       * No son la fuente real actual, pero se mantienen tipadas para no romper compile.
       */
      threads: {
        Row: {
          id: string;
          project_id: string;
          user_id: string | null;
          title: string | null;
          summary: string | null;
          meta: JsonObject | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          user_id?: string | null;
          title?: string | null;
          summary?: string | null;
          meta?: JsonObject | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          user_id: string | null;
          title: string | null;
          summary: string | null;
          meta: JsonObject | null;
          created_at: string;
          updated_at: string;
        }>;
      };

      messages: {
        Row: {
          id: string;
          thread_id: string;
          project_id: string;
          role: "system" | "user" | "assistant" | "tool";
          content: string;
          meta: JsonObject | null;
          created_at: string;
        };
        Insert: {
          id: string;
          thread_id: string;
          project_id: string;
          role: "system" | "user" | "assistant" | "tool";
          content: string;
          meta?: JsonObject | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          thread_id: string;
          project_id: string;
          role: "system" | "user" | "assistant" | "tool";
          content: string;
          meta: JsonObject | null;
          created_at: string;
        }>;
      };

      actions: {
        Row: {
          id: string;
          project_id: string;
          thread_id: string | null;
          node_id: string | null;
          command: string;
          payload: JsonObject;
          status: "queued" | "needs_approval" | "approved" | "rejected" | "executed" | "failed";
          needs_approval: boolean;
          approved_by: string | null;
          rejected_by: string | null;
          result: JsonObject | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          thread_id?: string | null;
          node_id?: string | null;
          command: string;
          payload: JsonObject;
          status?: "queued" | "needs_approval" | "approved" | "rejected" | "executed" | "failed";
          needs_approval?: boolean;
          approved_by?: string | null;
          rejected_by?: string | null;
          result?: JsonObject | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          thread_id: string | null;
          node_id: string | null;
          command: string;
          payload: JsonObject;
          status: "queued" | "needs_approval" | "approved" | "rejected" | "executed" | "failed";
          needs_approval: boolean;
          approved_by: string | null;
          rejected_by: string | null;
          result: JsonObject | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        }>;
      };
    };
  };
};