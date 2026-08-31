-- Calibration room (Stage 3).
--
-- 1) Presence heartbeat: a presence row counts as "live" while last_seen_at
--    is recent. The co-presence gate uses liveness only to OPEN a session;
--    once open, the release of partner data is permanent (CLAUDE.md §2:
--    "…before that pair's calibration session for that video has been
--    opened by both parties").
ALTER TABLE calibration_presence
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

-- One presence row per user per session; rejoining refreshes it.
CREATE UNIQUE INDEX IF NOT EXISTS one_presence_per_user_per_session
  ON calibration_presence (session_id, user_id);

-- At most one non-voided session per video and pair, so two coders joining
-- at the same moment cannot create parallel sessions.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_session_per_video_pair
  ON calibration_sessions (video_id, pair_id) WHERE status <> 'voided';

-- 2) The calibration record is immutable after sign-off (addendum §7),
--    enforced in the database like the score lock (0002/0003):
--    consensus items of a completed session never UPDATE, and never DELETE
--    for dataset 'live' (test/training rows stay purgeable).
CREATE OR REPLACE FUNCTION refuse_completed_calibration_item_change() RETURNS trigger AS $$
DECLARE
  s_status calibration_status;
BEGIN
  SELECT status INTO s_status
    FROM calibration_sessions
    WHERE id = COALESCE(OLD.session_id, NEW.session_id);
  IF s_status = 'completed' THEN
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'calibration item % belongs to a completed session and cannot be changed', OLD.id;
    END IF;
    -- TG_OP = 'DELETE'
    IF OLD.dataset = 'live' THEN
      RAISE EXCEPTION 'calibration item % belongs to a completed live session and cannot be deleted', OLD.id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calibration_items_completed_immutable
  BEFORE UPDATE OR DELETE ON calibration_items
  FOR EACH ROW EXECUTE FUNCTION refuse_completed_calibration_item_change();

-- 3) A completed session row itself may change only by being voided with a
--    reason (nothing is destructive — CLAUDE.md §7).
CREATE OR REPLACE FUNCTION refuse_completed_calibration_session_change() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'completed'
     AND NOT (NEW.status = 'voided' AND NEW.voided_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'calibration session % is completed; only voiding with a reason is allowed', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calibration_sessions_completed_immutable
  BEFORE UPDATE ON calibration_sessions
  FOR EACH ROW EXECUTE FUNCTION refuse_completed_calibration_session_change();
