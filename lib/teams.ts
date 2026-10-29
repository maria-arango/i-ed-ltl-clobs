/**
 * Team rules (Amendment §49), kept pure so they can be unit-tested.
 *
 * - Admins pass every check.
 * - Scoring screens and /api/coder/* are closed to accounts whose ONLY
 *   teams are other teams (e.g. Narratives-only). An account with no team
 *   rows at all is a pre-teams coder account and keeps scoring access;
 *   migration 0011 also gave every existing coder an explicit Scoring row.
 * - The Narratives workspace needs explicit Narratives membership.
 */
export const TEAMS = ["context_cards", "scoring", "narratives"] as const;
export type Team = (typeof TEAMS)[number];
export type Role = "admin" | "coder";

export const TEAM_LABELS: Record<Team, string> = {
  context_cards: "Context cards",
  scoring: "Scoring",
  narratives: "Narratives",
};

export function isTeam(x: unknown): x is Team {
  return typeof x === "string" && (TEAMS as readonly string[]).includes(x);
}

export function canAccessScoring(role: Role, teams: readonly Team[]): boolean {
  return role === "admin" || teams.length === 0 || teams.includes("scoring");
}

export function canAccessNarratives(role: Role, teams: readonly Team[]): boolean {
  return role === "admin" || teams.includes("narratives");
}

/** Where "/" sends a signed-in person. */
export function homePathFor(role: Role, teams: readonly Team[]): string {
  // Admins land on the original Home (Scoring home); Narratives is in the sidebar.
  if (role === "admin") return "/scoring";
  if (teams.includes("narratives")) return "/narratives";
  if (canAccessScoring(role, teams)) return "/scoring";
  return "/no-access";
}
