\set ON_ERROR_STOP on
CREATE TABLE alerts (id serial PRIMARY KEY, user_id text, card_id text NOT NULL, threshold_pct integer NOT NULL);
CREATE UNIQUE INDEX alerts_card_unique ON alerts(card_id);
INSERT INTO alerts(user_id,card_id,threshold_pct) VALUES ('alice','shared',10),(NULL,'legacy',30);
\i /tmp/security-migration.sql
\i /tmp/security-migration.sql
INSERT INTO alerts(user_id,card_id,threshold_pct) VALUES ('bob','shared',20);
INSERT INTO alerts(user_id,card_id,threshold_pct) VALUES ('alice','shared',15)
ON CONFLICT(user_id,card_id) DO UPDATE SET threshold_pct=excluded.threshold_pct;
DO $$ BEGIN
  IF (SELECT count(*) FROM alerts) <> 3
    OR (SELECT threshold_pct FROM alerts WHERE user_id='alice') <> 15
    OR (SELECT threshold_pct FROM alerts WHERE user_id='bob') <> 20
    OR NOT EXISTS(SELECT 1 FROM alerts WHERE user_id IS NULL AND card_id='legacy')
  THEN RAISE EXCEPTION 'Migration violated account isolation or preserved-data invariant'; END IF;
END $$;
