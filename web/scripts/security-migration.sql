-- Run once against the intended database before deploying the security patch.
-- No data is deleted or assigned to an inferred owner.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS alerts_user_card_unique ON alerts (user_id, card_id);
DROP INDEX IF EXISTS alerts_card_unique;
COMMIT;
