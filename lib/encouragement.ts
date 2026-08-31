/**
 * Positive-reinforcement copy (docs/05-encouragement.md): competence
 * feedback and purpose framing, never speed, never comparison. Drawn at
 * random without immediate repeats; shown only at real completion moments.
 */

const SCORES_SUBMITTED = [
  "All eight concepts scored and locked. Careful work like this is what makes the scores trustworthy.",
  "Done — your scores are safely in. That's one more lesson the study can learn from.",
  "Observation scored. Another classroom carefully observed — this is the data the project runs on.",
  "Complete. Ugandan classrooms are better understood because of work like this.",
] as const;

const CARD_SUBMITTED = [
  "Context card done — the classroom is on record.",
  "Card submitted. The setup is on record for the study.",
] as const;

let lastIndex = -1;

function pick(pool: readonly string[]): string {
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === lastIndex) i = (i + 1) % pool.length;
  lastIndex = i;
  return pool[i];
}

export const encouragement = {
  scoresSubmitted: () => pick(SCORES_SUBMITTED),
  cardSubmitted: () => pick(CARD_SUBMITTED),
};
