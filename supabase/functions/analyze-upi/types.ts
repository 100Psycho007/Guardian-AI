export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  scan_stats: Json;
};

export type ScanStatus = 'pending' | 'processing' | 'complete' | 'failed';

export type ScanRow = {
  id: string;
  user_id: string;
  storage_path: string;
  status: ScanStatus;
  checksum: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

export type FraudAlertStatus = 'open' | 'investigating' | 'dismissed' | 'resolved';
export type FraudAlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type FraudAlertRow = {
  id: string;
  scan_id: string;
  user_id: string;
  status: FraudAlertStatus;
  severity: FraudAlertSeverity;
  reason: string;
  notes: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
      };
      scans: {
        Row: ScanRow;
      };
      fraud_alerts: {
        Row: FraudAlertRow;
      };
    };
  };
};

export type ProfileScanStats = {
  total_scans: number;
  high_risk_scans: number;
  last_scan_id?: string;
  last_scan_at?: string;
  last_risk_score?: number;
  last_fraud_probability?: number;
};

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ClaudeAnalysis = {
  summary: string;
  riskLevel: RiskLevel;
  riskScore: number;
  fraudProbability: number;
  riskFactors: string[];
  recommendedActions: string[];
  rawText: string;
  confidence?: number;
};

export type UpiDetails = {
  upiId: string | null;
  payerName: string | null;
  payeeName: string | null;
  amount: number | null;
  currency: string | null;
  referenceId: string | null;
  note: string | null;
  rawMatches: string[];
  confidence: number;
  extractedFields: Record<string, string>;
};

export type RiskAssessment = {
  riskScore: number;
  fraudProbability: number;
  riskLevel: RiskLevel;
  flags: string[];
};

export type ScanMetadata = {
  request_id: string;
  bucket: string;
  storage_path: string;
  ocr_text: string;
  upi_details: UpiDetails;
  risk: RiskAssessment;
  claude_analysis: ClaudeAnalysis | null;
  hints: string[];
  flags: string[];
  timings: {
    total_ms: number;
    ocr_ms?: number;
    reasoning_ms?: number;
  };
  extra?: Record<string, unknown>;
};

export type AnalyzeUpiRequest = {
  storagePath?: string;
  storage_path?: string;
  bucket?: string;
  scanId?: string;
  scan_id?: string;
  hints?: unknown;
  metadata?: unknown;
  forceRefresh?: boolean;
};
