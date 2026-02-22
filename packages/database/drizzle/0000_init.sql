-- OpenGrant Database Schema
-- Full schema matching Drizzle schema.ts

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE publisher_status AS ENUM ('pending','active','suspended','inactive');
CREATE TYPE api_status AS ENUM ('draft','active','deprecated','inactive');
CREATE TYPE health_status AS ENUM ('healthy','degraded','down','unknown');
CREATE TYPE payment_status AS ENUM ('pending','verified','settled','failed');
CREATE TYPE withdrawal_status AS ENUM ('pending','processing','completed','failed');
CREATE TYPE http_method AS ENUM ('GET','POST','PUT','PATCH','DELETE');
CREATE TYPE claim_status AS ENUM ('unclaimed','pending','claimed','opted_out');
CREATE TYPE donation_status AS ENUM ('confirmed','refunded','redistributed');
CREATE TYPE package_manager AS ENUM ('npm','cargo','go');
CREATE TYPE donation_source AS ENUM ('direct','stack','explore','api_tip');

-- ============================================
-- PUBLISHERS
-- ============================================

CREATE TABLE publishers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  github_username VARCHAR(100),
  avatar_url TEXT,
  bio TEXT,
  website_url TEXT,
  vault_address VARCHAR(42),
  registry_tx_hash VARCHAR(66),
  github_id INTEGER UNIQUE,
  github_verified BOOLEAN NOT NULL DEFAULT FALSE,
  github_verified_at TIMESTAMPTZ,
  status publisher_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  settings JSONB NOT NULL DEFAULT '{"notifications":{"email":true,"webhook":false},"payoutThreshold":"10000000","autoWithdraw":false}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_publishers_status ON publishers(status);

-- ============================================
-- GITHUB REPOS (Fund Feature)
-- ============================================

CREATE TABLE github_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT NOT NULL UNIQUE,
  owner VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(512) NOT NULL,
  repo_hash VARCHAR(66) NOT NULL UNIQUE,
  description TEXT,
  language VARCHAR(50),
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT,
  homepage_url TEXT,
  topics TEXT[],
  license VARCHAR(100),
  claim_status claim_status NOT NULL DEFAULT 'unclaimed',
  claimed_by VARCHAR(42),
  claimed_at TIMESTAMPTZ,
  claim_tx_hash VARCHAR(66),
  opted_out BOOLEAN NOT NULL DEFAULT FALSE,
  opted_out_at TIMESTAMPTZ,
  total_funded NUMERIC(20,6) NOT NULL DEFAULT '0',
  total_claimed NUMERIC(20,6) NOT NULL DEFAULT '0',
  donor_count INTEGER NOT NULL DEFAULT 0,
  funding_yml_wallet VARCHAR(42),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_github_repos_github_id ON github_repos(github_id);
CREATE INDEX idx_github_repos_repo_hash ON github_repos(repo_hash);
CREATE INDEX idx_github_repos_owner_name ON github_repos(owner, name);
CREATE INDEX idx_github_repos_language ON github_repos(language);
CREATE INDEX idx_github_repos_stars ON github_repos(stars);
CREATE INDEX idx_github_repos_total_funded ON github_repos(total_funded);
CREATE INDEX idx_github_repos_claim_status ON github_repos(claim_status);

-- ============================================
-- APIs
-- ============================================

CREATE TABLE apis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  onchain_id VARCHAR(66) UNIQUE,
  on_chain_api_id VARCHAR(66),
  github_repo_id UUID REFERENCES github_repos(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  documentation_url TEXT,
  base_url TEXT NOT NULL,
  logo_url TEXT,
  category VARCHAR(50),
  tags TEXT[],
  status api_status NOT NULL DEFAULT 'draft',
  health_status health_status NOT NULL DEFAULT 'unknown',
  last_health_check TIMESTAMPTZ,
  total_calls BIGINT NOT NULL DEFAULT 0,
  total_revenue NUMERIC(20,6) NOT NULL DEFAULT '0',
  unique_consumers INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX idx_apis_publisher ON apis(publisher_id);
CREATE INDEX idx_apis_status ON apis(status);
CREATE INDEX idx_apis_category ON apis(category);
CREATE INDEX idx_apis_slug ON apis(slug);
CREATE UNIQUE INDEX idx_apis_publisher_slug ON apis(publisher_id, slug);
CREATE INDEX idx_apis_github_repo ON apis(github_repo_id);

-- ============================================
-- ENDPOINTS
-- ============================================

CREATE TABLE endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_id UUID NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
  path VARCHAR(500) NOT NULL,
  method http_method NOT NULL,
  price_per_call BIGINT NOT NULL DEFAULT 0,
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  rate_limit_per_day INTEGER DEFAULT 10000,
  description TEXT,
  request_schema JSONB,
  response_schema JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  requires_auth BOOLEAN NOT NULL DEFAULT TRUE,
  total_calls BIGINT NOT NULL DEFAULT 0,
  total_revenue NUMERIC(20,6) NOT NULL DEFAULT '0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_endpoints_api ON endpoints(api_id);
CREATE INDEX idx_endpoints_active ON endpoints(api_id, is_active);
CREATE INDEX idx_endpoints_price ON endpoints(price_per_call);
CREATE UNIQUE INDEX idx_endpoints_api_path_method ON endpoints(api_id, path, method);

-- ============================================
-- CONSUMERS
-- ============================================

CREATE TABLE consumers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  name VARCHAR(255),
  email VARCHAR(255),
  privy_user_id VARCHAR(100),
  embedded_wallet_address VARCHAR(42),
  credit_balance NUMERIC(20,6) NOT NULL DEFAULT '0',
  settings JSONB NOT NULL DEFAULT '{"autoFund":false,"lowBalanceThreshold":"1000000"}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consumers_wallet ON consumers(wallet_address);
CREATE INDEX idx_consumers_privy ON consumers(privy_user_id);

-- ============================================
-- API KEYS
-- ============================================

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id UUID NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  key_prefix VARCHAR(8) NOT NULL,
  name VARCHAR(100) NOT NULL,
  allowed_apis UUID[],
  allowed_endpoints UUID[],
  rate_limit_override JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_consumer ON api_keys(consumer_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- ============================================
-- USAGE RECORDS
-- ============================================

CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_id UUID NOT NULL REFERENCES apis(id),
  endpoint_id UUID NOT NULL REFERENCES endpoints(id),
  consumer_id UUID NOT NULL REFERENCES consumers(id),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  request_id VARCHAR(36) NOT NULL,
  request_timestamp TIMESTAMPTZ NOT NULL,
  price_charged BIGINT NOT NULL,
  payment_payload JSONB,
  payment_tx_hash VARCHAR(66),
  payment_status payment_status NOT NULL DEFAULT 'pending',
  response_time_ms INTEGER,
  response_status INTEGER,
  settlement_batch_id UUID,
  settled_at TIMESTAMPTZ
);

CREATE INDEX idx_usage_api_time ON usage_records(api_id, request_timestamp);
CREATE INDEX idx_usage_consumer ON usage_records(consumer_id, request_timestamp);
CREATE INDEX idx_usage_settlement ON usage_records(payment_status, request_timestamp);
CREATE INDEX idx_usage_request_id ON usage_records(request_id);
CREATE INDEX idx_usage_api_status ON usage_records(api_id, payment_status);

-- ============================================
-- PAYMENTS
-- ============================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id UUID NOT NULL REFERENCES publishers(id),
  api_id UUID NOT NULL REFERENCES apis(id),
  gross_amount NUMERIC(20,6) NOT NULL,
  platform_fee NUMERIC(20,6) NOT NULL,
  net_amount NUMERIC(20,6) NOT NULL,
  settlement_tx_hash VARCHAR(66),
  settled_at TIMESTAMPTZ,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  usage_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_publisher ON payments(publisher_id);
CREATE INDEX idx_payments_period ON payments(period_start, period_end);
CREATE INDEX idx_payments_api ON payments(api_id);

-- ============================================
-- WITHDRAWALS
-- ============================================

CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id UUID NOT NULL REFERENCES publishers(id),
  amount NUMERIC(20,6) NOT NULL,
  destination_address VARCHAR(42) NOT NULL,
  destination_chain VARCHAR(20) NOT NULL,
  tx_hash VARCHAR(66),
  status withdrawal_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- ============================================
-- FUND DONATIONS
-- ============================================

CREATE TABLE fund_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
  donor_wallet VARCHAR(42) NOT NULL,
  amount NUMERIC(20,6) NOT NULL,
  tx_hash VARCHAR(66) NOT NULL UNIQUE,
  chain_id INTEGER NOT NULL,
  redistribute_on_timeout BOOLEAN NOT NULL DEFAULT FALSE,
  status donation_status NOT NULL DEFAULT 'confirmed',
  source donation_source NOT NULL DEFAULT 'direct',
  refund_eligible_at TIMESTAMPTZ,
  refund_tx_hash VARCHAR(66),
  refunded_at TIMESTAMPTZ,
  analysis_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fund_donations_repo ON fund_donations(repo_id);
CREATE INDEX idx_fund_donations_donor ON fund_donations(donor_wallet);
CREATE INDEX idx_fund_donations_tx_hash ON fund_donations(tx_hash);
CREATE INDEX idx_fund_donations_status ON fund_donations(status);
CREATE INDEX idx_fund_donations_refund_eligible ON fund_donations(refund_eligible_at);

-- ============================================
-- DEPENDENCY ANALYSES
-- ============================================

CREATE TABLE dependency_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by VARCHAR(42) NOT NULL,
  package_manager package_manager NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  dependencies JSONB NOT NULL,
  scores JSONB NOT NULL,
  total_dependencies INTEGER NOT NULL,
  direct_dependencies INTEGER NOT NULL,
  executed_budget NUMERIC(20,6),
  executed_tx_hash VARCHAR(66),
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_dep_analyses_input_hash ON dependency_analyses(input_hash);
CREATE INDEX idx_dep_analyses_requested_by ON dependency_analyses(requested_by);
CREATE INDEX idx_dep_analyses_expires_at ON dependency_analyses(expires_at);

-- ============================================
-- TRIGGERS (auto-update updated_at)
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_publishers_updated_at BEFORE UPDATE ON publishers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_apis_updated_at BEFORE UPDATE ON apis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_endpoints_updated_at BEFORE UPDATE ON endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_consumers_updated_at BEFORE UPDATE ON consumers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
