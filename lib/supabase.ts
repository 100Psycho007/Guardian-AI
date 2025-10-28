import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL, assertEnv } from './env';

assertEnv();

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          scan_stats: Json;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          scan_stats?: Json;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          scan_stats?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      scans: {
        Row: {
          checksum: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          processed_at: string | null;
          status: 'pending' | 'processing' | 'complete' | 'failed';
          storage_path: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          checksum?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          processed_at?: string | null;
          status?: 'pending' | 'processing' | 'complete' | 'failed';
          storage_path: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          checksum?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          processed_at?: string | null;
          status?: 'pending' | 'processing' | 'complete' | 'failed';
          storage_path?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      fraud_alerts: {
        Row: {
          created_at: string;
          id: string;
          metadata: Json;
          notes: string | null;
          reason: string;
          resolved_at: string | null;
          scan_id: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
          status: 'open' | 'investigating' | 'dismissed' | 'resolved';
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          metadata?: Json;
          notes?: string | null;
          reason: string;
          resolved_at?: string | null;
          scan_id: string;
          severity?: 'low' | 'medium' | 'high' | 'critical';
          status?: 'open' | 'investigating' | 'dismissed' | 'resolved';
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          metadata?: Json;
          notes?: string | null;
          reason?: string;
          resolved_at?: string | null;
          scan_id?: string;
          severity?: 'low' | 'medium' | 'high' | 'critical';
          status?: 'open' | 'investigating' | 'dismissed' | 'resolved';
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Scan = Database['public']['Tables']['scans']['Row'];
export type FraudAlert = Database['public']['Tables']['fraud_alerts']['Row'];
export type ScanStatus = Scan['status'];
export type FraudAlertStatus = FraudAlert['status'];
export type FraudAlertSeverity = FraudAlert['severity'];

export type TypedSupabaseClient = SupabaseClient<Database>;

let client: TypedSupabaseClient | null = null;

export function getSupabaseClient(): TypedSupabaseClient {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Supabase environment variables are missing. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
      );
    }

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  return client;
}

export const supabase = getSupabaseClient();

export function fetchProfileById(userId: string, suppliedClient: TypedSupabaseClient = getSupabaseClient()) {
  return suppliedClient.from('profiles').select('*').eq('id', userId).maybeSingle();
}

export function upsertProfile(
  profile: Database['public']['Tables']['profiles']['Insert'],
  suppliedClient: TypedSupabaseClient = getSupabaseClient(),
) {
  return suppliedClient.from('profiles').upsert(profile).select().maybeSingle();
}

export function createScan(
  scan: Database['public']['Tables']['scans']['Insert'],
  suppliedClient: TypedSupabaseClient = getSupabaseClient(),
) {
  return suppliedClient.from('scans').insert(scan).select().single();
}

export function listScansForUser(
  userId: string,
  suppliedClient: TypedSupabaseClient = getSupabaseClient(),
) {
  return suppliedClient
    .from('scans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export function listFraudAlerts(
  suppliedClient: TypedSupabaseClient = getSupabaseClient(),
  filter?: { userId?: string; scanId?: string },
) {
  let query = suppliedClient.from('fraud_alerts').select('*').order('created_at', { ascending: false });

  if (filter?.userId) {
    query = query.eq('user_id', filter.userId);
  }

  if (filter?.scanId) {
    query = query.eq('scan_id', filter.scanId);
  }

  return query;
}

export function updateFraudAlert(
  id: string,
  updates: Database['public']['Tables']['fraud_alerts']['Update'],
  suppliedClient: TypedSupabaseClient = getSupabaseClient(),
) {
  return suppliedClient.from('fraud_alerts').update(updates).eq('id', id).select().maybeSingle();
}
