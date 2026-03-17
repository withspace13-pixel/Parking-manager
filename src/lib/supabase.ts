import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);

export type Project = {
  id: string;
  org_name: string;
  manager: string;
  start_date: string;
  end_date: string;
  parking_support: boolean;
  remarks: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProjectRoom = {
  id: string;
  project_id: string;
  date: string;
  room_name: string;
  created_at?: string;
};

export type ParkingRecord = {
  id: string;
  project_id: string;
  vehicle_num: string;
  date: string;
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
  created_at?: string;
  updated_at?: string;
};

export const TICKET_PRICES = {
  all_day: 30000,
  "2h": 12000,
  "1h": 6000,
  "30m": 3000,
} as const;
