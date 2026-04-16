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
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          meta?: JsonObject | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
      };
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
        Update: Partial<Database["public"]["Tables"]["threads"]["Insert"]>;
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
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
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
        Update: Partial<Database["public"]["Tables"]["actions"]["Insert"]>;
      };
      system_controls: {
        Row: {
          id: string;
          project_id: string;
          kill_switch: boolean;
          allow_write: boolean;
          meta: JsonObject | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          kill_switch?: boolean;
          allow_write?: boolean;
          meta?: JsonObject | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["system_controls"]["Insert"]>;
      };
      nodes: {
        Row: {
          id: string;
          project_id: string;
          name: string | null;
          type: "cloud" | "agent" | "app";
          status: "online" | "offline" | "degraded" | "idle" | "busy" | "warning" | "error";
          last_seen_at: string | null;
          tags: string[];
          meta: JsonObject | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          name?: string | null;
          type?: "cloud" | "agent" | "app";
          status?: "online" | "offline" | "degraded" | "idle" | "busy" | "warning" | "error";
          last_seen_at?: string | null;
          tags?: string[];
          meta?: JsonObject | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["nodes"]["Insert"]>;
      };
      events: {
        Row: {
          id: string;
          project_id: string;
          node_id: string | null;
          type: string;
          message: string;
          level: "info" | "warn" | "error";
          data: JsonObject | null;
          created_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          node_id?: string | null;
          type: string;
          message: string;
          level?: "info" | "warn" | "error";
          data?: JsonObject | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
      };
    };
  };
};