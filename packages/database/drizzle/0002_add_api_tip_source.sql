-- Add 'api_tip' value to the existing donation_source enum
ALTER TYPE donation_source ADD VALUE IF NOT EXISTS 'api_tip';
