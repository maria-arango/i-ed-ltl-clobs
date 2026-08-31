-- Refinement of the score lock (0002): locked LIVE scores remain immutable
-- forever — no UPDATE, no DELETE, by anyone. But sandbox rows
-- (dataset 'test'/'training') may be DELETED even when locked, or the
-- ADR 0001 test-purge action (and test cleanup) could never run.
-- Updates stay refused for every dataset: a locked score is never edited.

CREATE OR REPLACE FUNCTION refuse_locked_score_change() RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'score % is locked since % and cannot be changed', OLD.id, OLD.locked_at;
    END IF;
    -- TG_OP = 'DELETE'
    IF OLD.dataset = 'live' THEN
      RAISE EXCEPTION 'score % is locked since % and cannot be deleted (live dataset)', OLD.id, OLD.locked_at;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
