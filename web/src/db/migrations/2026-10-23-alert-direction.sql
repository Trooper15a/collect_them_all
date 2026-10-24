-- Backward-compatible: existing watches continue to trigger in either direction.
BEGIN;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'either';
COMMIT;
