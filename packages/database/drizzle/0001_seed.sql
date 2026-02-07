-- OpenGrant Seed Data
-- Sample data for development and testing

-- Sample Publisher: Tailwind Labs
INSERT INTO publishers (id, name, slug, description, website, owner_address, is_verified)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Tailwind Labs',
  'tailwind',
  'The creators of Tailwind CSS, building tools for modern web development.',
  'https://tailwindcss.com',
  '0x1234567890123456789012345678901234567890',
  TRUE
) ON CONFLICT (slug) DO NOTHING;

-- Sample Publisher: ColorGen
INSERT INTO publishers (id, name, slug, description, website, owner_address, is_verified)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  'ColorGen',
  'colorgen',
  'AI-powered color palette generation and analysis.',
  'https://colorgen.io',
  '0x2345678901234567890123456789012345678901',
  TRUE
) ON CONFLICT (slug) DO NOTHING;

-- Tailwind CSS API
INSERT INTO apis (id, publisher_id, name, slug, description, base_url, is_active)
VALUES (
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Tailwind CSS API',
  'tailwind',
  'Generate Tailwind CSS classes and utilities programmatically. Perfect for AI-powered design tools.',
  'https://api.tailwindcss.com',
  TRUE
) ON CONFLICT (slug) DO NOTHING;

-- Tailwind CSS Endpoints
INSERT INTO endpoints (api_id, path, method, description, price_per_call, rate_limit)
VALUES
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '/v1/generate', 'POST', 'Generate Tailwind classes from description', 10000, 60),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '/v1/validate', 'POST', 'Validate Tailwind class combinations', 5000, 120),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '/v1/suggest', 'GET', 'Get class suggestions', 2000, 200)
ON CONFLICT DO NOTHING;

-- Color Palette API
INSERT INTO apis (id, publisher_id, name, slug, description, base_url, is_active)
VALUES (
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  'Color Palette Generator',
  'colors',
  'AI-powered color palette generation and analysis. Create beautiful color schemes instantly.',
  'https://api.colorgen.io',
  TRUE
) ON CONFLICT (slug) DO NOTHING;

-- Color Palette Endpoints
INSERT INTO endpoints (api_id, path, method, description, price_per_call, rate_limit)
VALUES
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '/v1/generate', 'POST', 'Generate color palette', 8000, 60),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '/v1/analyze', 'POST', 'Analyze image colors', 4000, 60),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '/v1/harmonize', 'POST', 'Find harmonizing colors', 3000, 120)
ON CONFLICT DO NOTHING;

-- Sample Consumer
INSERT INTO consumers (id, wallet_address, email)
VALUES (
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  '0x9876543210987654321098765432109876543210',
  'demo@example.com'
) ON CONFLICT (wallet_address) DO NOTHING;

-- Sample API Key for demo consumer (hash of 'og_live_demo_key_for_testing_only_12345678')
INSERT INTO api_keys (id, consumer_id, name, key_hash, key_prefix, is_active)
VALUES (
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Demo Key',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'og_live_demo',
  TRUE
) ON CONFLICT (key_hash) DO NOTHING;
