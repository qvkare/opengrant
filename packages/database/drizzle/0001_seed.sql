-- OpenGrant Seed Data
-- Sample data for development and testing

-- Sample Publisher: Tailwind Labs
INSERT INTO publishers (id, wallet_address, name, website_url, status)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  '0x1234567890123456789012345678901234567890',
  'Tailwind Labs',
  'https://tailwindcss.com',
  'active'
) ON CONFLICT (wallet_address) DO NOTHING;

-- Sample Publisher: ColorGen
INSERT INTO publishers (id, wallet_address, name, website_url, status)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  '0x2345678901234567890123456789012345678901',
  'ColorGen',
  'https://colorgen.io',
  'active'
) ON CONFLICT (wallet_address) DO NOTHING;

-- Tailwind CSS API
INSERT INTO apis (id, publisher_id, name, slug, description, base_url, status)
VALUES (
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Tailwind CSS API',
  'tailwind',
  'Generate Tailwind CSS classes and utilities programmatically.',
  'https://api.tailwindcss.com',
  'active'
) ON CONFLICT DO NOTHING;

-- Tailwind CSS Endpoints
INSERT INTO endpoints (api_id, path, method, description, price_per_call)
VALUES
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '/v1/generate', 'POST', 'Generate Tailwind classes from description', 10000),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '/v1/validate', 'POST', 'Validate Tailwind class combinations', 5000),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '/v1/suggest', 'GET', 'Get class suggestions', 2000)
ON CONFLICT DO NOTHING;

-- Color Palette API
INSERT INTO apis (id, publisher_id, name, slug, description, base_url, status)
VALUES (
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  'Color Palette Generator',
  'colors',
  'AI-powered color palette generation and analysis.',
  'https://api.colorgen.io',
  'active'
) ON CONFLICT DO NOTHING;

-- Color Palette Endpoints
INSERT INTO endpoints (api_id, path, method, description, price_per_call)
VALUES
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '/v1/generate', 'POST', 'Generate color palette', 8000),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '/v1/analyze', 'POST', 'Analyze image colors', 4000),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '/v1/harmonize', 'POST', 'Find harmonizing colors', 3000)
ON CONFLICT DO NOTHING;

-- Sample Consumer
INSERT INTO consumers (id, wallet_address, email)
VALUES (
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  '0x9876543210987654321098765432109876543210',
  'demo@example.com'
) ON CONFLICT (wallet_address) DO NOTHING;

-- Sample API Key for demo consumer
INSERT INTO api_keys (id, consumer_id, name, key_hash, key_prefix, is_active)
VALUES (
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Demo Key',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'og_live_',
  TRUE
) ON CONFLICT (key_hash) DO NOTHING;
