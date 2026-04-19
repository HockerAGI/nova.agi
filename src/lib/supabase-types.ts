import type { JsonObject } from "../types.js";

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: { id: string; name: string | null; meta: JsonObject | null; created_at: string };
        Insert: { id: string; name?: string | null; meta?: JsonObject | null; created_at?: string };
        Update: Partial<{ id: string; name: string | null; meta: JsonObject | null; created_at: string }>;
      };
      agis: {
        Row: { id: string; name: string | null; description: string | null; version: string | null; tags: string[]; meta: JsonObject | null; created_at: string };
        Insert: { id: string; name?: string | null; description?: string | null; version?: string | null; tags?: string[]; meta?: JsonObject | null; created_at?: string };
        Update: Partial<{ id: string; name: string | null; description: string | null; version: string | null; tags: string[]; meta: JsonObject | null; created_at: string }>;
      };
      system_controls: {
        Row: { id: string; project_id: string; kill_switch: boolean; allow_write: boolean; meta: JsonObject | null; created_at: string; updated_at: string };
        Insert: { id?: string; project_id: string; kill_switch?: boolean; allow_write?: boolean; meta?: JsonObject | null; created_at?: string; updated_at?: string };
        Update: Partial<{ id: string; project_id: string; kill_switch: boolean; allow_write: boolean; meta: JsonObject | null; created_at: string; updated_at: string }>;
      };
      events: {
        Row: { id: string; project_id: string; node_id: string | null; level: string; type: string; message: string; data: JsonObject | null; created_at: string };
        Insert: { id?: string; project_id: string; node_id?: string | null; level?: string; type: string; message: string; data?: JsonObject | null; created_at?: string };
        Update: Partial<{ id: string; project_id: string; node_id: string | null; level: string; type: string; message: string; data: JsonObject | null; created_at: string }>;
      };
      nova_threads: {
        Row: { id: string; project_id: string; user_id: string | null; title: string | null; summary: string | null; meta: JsonObject | null; created_at: string; updated_at: string };
        Insert: { id?: string; project_id: string; user_id?: string | null; title?: string | null; summary?: string | null; meta?: JsonObject | null; created_at?: string; updated_at?: string };
        Update: Partial<{ id: string; project_id: string; user_id: string | null; title: string | null; summary: string | null; meta: JsonObject | null; created_at: string; updated_at: string }>;
      };
      nova_messages: {
        Row: { id: string; project_id: string; thread_id: string; role: string; content: string; meta: JsonObject | null; created_at: string };
        Insert: { id?: string; project_id: string; thread_id: string; role: string; content: string; meta?: JsonObject | null; created_at?: string };
        Update: Partial<{ id: string; project_id: string; thread_id: string; role: string; content: string; meta: JsonObject | null; created_at: string }>;
      };
      commands: {
        Row: { id: string; project_id: string; node_id: string; command: string; payload: JsonObject | null; status: string; needs_approval: boolean; signature: string; result: JsonObject | null; error: string | null; created_at: string; approved_at: string | null; started_at: string | null; executed_at: string | null; finished_at: string | null };
        Insert: { id: string; project_id: string; node_id: string; command: string; payload?: JsonObject | null; status?: string; needs_approval?: boolean; signature: string; result?: JsonObject | null; error?: string | null; created_at?: string; approved_at?: string | null; started_at?: string | null; executed_at?: string | null; finished_at?: string | null };
        Update: Partial<{ id: string; project_id: string; node_id: string; command: string; payload: JsonObject | null; status: string; needs_approval: boolean; signature: string; result: JsonObject | null; error: string | null; created_at: string; approved_at: string | null; started_at: string | null; executed_at: string | null; finished_at: string | null }>;
      };
      llm_usage: {
        Row: { id: string; project_id: string; thread_id: string | null; provider: string; model: string | null; tokens_in: number | null; tokens_out: number | null; cost_usd: number | null; meta: JsonObject | null; created_at: string };
        Insert: { id?: string; project_id: string; thread_id?: string | null; provider: string; model?: string | null; tokens_in?: number | null; tokens_out?: number | null; cost_usd?: number | null; meta?: JsonObject | null; created_at?: string };
        Update: Partial<{ id: string; project_id: string; thread_id: string | null; provider: string; model: string | null; tokens_in: number | null; tokens_out: number | null; cost_usd: number | null; meta: JsonObject | null; created_at: string }>;
      };
    };
  };
};