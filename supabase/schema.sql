-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  avatar_url TEXT,
  reputation_score INTEGER DEFAULT 0,
  total_scans INTEGER DEFAULT 0,
  fraud_detected INTEGER DEFAULT 0,
  money_saved DECIMAL(12, 2) DEFAULT 0,
  premium_until TIMESTAMP,
  device_token TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scans
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  image_url TEXT,
  extracted_data JSONB NOT NULL,
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  fraud_probability TEXT NOT NULL CHECK (fraud_probability IN ('low', 'medium', 'high', 'critical')),
  ai_reasoning TEXT NOT NULL,
  fraud_flags JSONB DEFAULT '[]'::jsonb,
  scam_category TEXT,
  recommended_action TEXT,
  upi_id TEXT,
  merchant TEXT,
  amount DECIMAL(12, 2),
  message TEXT,
  is_bookmarked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fraud Alerts (community-reported)
CREATE TABLE fraud_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('upi', 'phone', 'merchant', 'url')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  report_count INTEGER DEFAULT 1,
  verified_count INTEGER DEFAULT 0,
  last_reported TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fraud Reports (user submissions)
CREATE TABLE fraud_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES auth.users ON DELETE SET NULL,
  alert_id UUID REFERENCES fraud_alerts ON DELETE CASCADE,
  scan_id UUID REFERENCES scans ON DELETE SET NULL,
  details TEXT,
  evidence_urls TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage Tracking (for free tier limits)
CREATE TABLE usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  scan_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, year, month)
);

-- Notifications (push notification log)
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_scans_user_id ON scans(user_id);
CREATE INDEX idx_scans_created_at ON scans(created_at DESC);
CREATE INDEX idx_scans_risk_score ON scans(risk_score DESC);
CREATE INDEX idx_fraud_alerts_entity ON fraud_alerts(entity_id);
CREATE INDEX idx_fraud_alerts_created_at ON fraud_alerts(created_at DESC);
CREATE INDEX idx_fraud_reports_alert_id ON fraud_reports(alert_id);
CREATE INDEX idx_usage_tracking_user_month ON usage_tracking(user_id, year, month);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read);

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Allow users to create their own profile row
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Scans
CREATE POLICY "Users can view own scans"
  ON scans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scans"
  ON scans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scans"
  ON scans FOR UPDATE
  USING (auth.uid() = user_id);

-- Fraud Alerts (anyone authenticated can view)
CREATE POLICY "Authenticated users can view fraud alerts"
  ON fraud_alerts FOR SELECT
  TO authenticated
  USING (true);

-- Fraud Reports
CREATE POLICY "Users can view own reports"
  ON fraud_reports FOR SELECT
  USING (auth.uid() = reporter_id);

CREATE POLICY "Users can insert reports"
  ON fraud_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Usage Tracking
CREATE POLICY "Users can view own usage"
  ON usage_tracking FOR SELECT
  USING (auth.uid() = user_id);

-- Notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Functions

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Increment user stats after scan
CREATE OR REPLACE FUNCTION increment_user_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles
  SET
    total_scans = total_scans + 1,
    fraud_detected = CASE WHEN NEW.risk_score > 70 THEN fraud_detected + 1 ELSE fraud_detected END,
    money_saved = CASE WHEN NEW.risk_score > 70 AND NEW.amount IS NOT NULL THEN money_saved + NEW.amount ELSE money_saved END,
    reputation_score = reputation_score + 10
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_scan_insert
  AFTER INSERT ON scans
  FOR EACH ROW
  EXECUTE FUNCTION increment_user_stats();

-- Track monthly usage
CREATE OR REPLACE FUNCTION track_monthly_usage()
RETURNS TRIGGER AS $$
DECLARE
  current_year INTEGER := EXTRACT(YEAR FROM NOW());
  current_month INTEGER := EXTRACT(MONTH FROM NOW());
BEGIN
  INSERT INTO usage_tracking (user_id, year, month, scan_count)
  VALUES (NEW.user_id, current_year, current_month, 1)
  ON CONFLICT (user_id, year, month)
  DO UPDATE SET scan_count = usage_tracking.scan_count + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_scan_usage
  AFTER INSERT ON scans
  FOR EACH ROW
  EXECUTE FUNCTION track_monthly_usage();

-- Check if user has reached free tier limit
CREATE OR REPLACE FUNCTION check_scan_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_year INTEGER := EXTRACT(YEAR FROM NOW());
  current_month INTEGER := EXTRACT(MONTH FROM NOW());
  current_usage INTEGER;
  is_premium BOOLEAN;
BEGIN
  -- Check if user is premium
  SELECT (premium_until IS NOT NULL AND premium_until > NOW())
  INTO is_premium
  FROM profiles
  WHERE id = p_user_id;
  
  -- Premium users have unlimited scans
  IF is_premium THEN
    RETURN TRUE;
  END IF;
  
  -- Check usage for free tier
  SELECT COALESCE(scan_count, 0)
  INTO current_usage
  FROM usage_tracking
  WHERE user_id = p_user_id
    AND year = current_year
    AND month = current_month;
  
  -- Free tier limit: 10 scans per month
  RETURN current_usage < 10;
END;
$$ LANGUAGE plpgsql;

-- Storage: Create scans bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('scans', 'scans', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for scans bucket
-- Allow users to upload objects under their own prefix `${uid}/...`
CREATE POLICY "Users can upload to own scans prefix"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'scans'
    AND (
      position((auth.uid()::text || '/') in name) = 1
    )
  );

-- Allow users to read their own objects
CREATE POLICY "Users can read own scans"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'scans'
    AND (
      position((auth.uid()::text || '/') in name) = 1
    )
  );

-- Allow users to update/delete their own objects
CREATE POLICY "Users can modify own scans"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'scans'
    AND (
      position((auth.uid()::text || '/') in name) = 1
    )
  );

CREATE POLICY "Users can delete own scans"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'scans'
    AND (
      position((auth.uid()::text || '/') in name) = 1
    )
  );


