-- Individual scores lock on submission (CLAUDE.md §6). Once locked_at is
-- set, the row can never be updated or deleted again — by anyone, through
-- any client, including the admin role. Enforced here in the database so a
-- calibrated score is always evidence that the individual scores could not
-- have been edited afterwards.

CREATE OR REPLACE FUNCTION refuse_locked_score_change() RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'score % is locked since % and cannot be changed', OLD.id, OLD.locked_at;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scores_locked_are_immutable
  BEFORE UPDATE OR DELETE ON scores
  FOR EACH ROW EXECUTE FUNCTION refuse_locked_score_change();
