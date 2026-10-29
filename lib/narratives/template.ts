/** Shape of a review template (narrative_templates.content). */
export interface TemplateQuestionPart {
  key: string;
  prompt: string;
}
export interface TemplateQuestion {
  key: string;
  title: string;
  prompt: string;
  parts?: TemplateQuestionPart[];
}
export interface NarrativeTemplate {
  version: string;
  title: string;
  checkNote: string;
  howToEditLabel: string;
  howToEdit: string;
  questions: TemplateQuestion[];
  timeLabel: string;
  narrativeLabel: string;
}

/** The answer boxes, in order: questions without parts get one box each. */
export function answerFields(t: NarrativeTemplate): Array<{ key: string; title?: string; prompt: string }> {
  const out: Array<{ key: string; title?: string; prompt: string }> = [];
  for (const q of t.questions) {
    if (q.parts?.length) {
      q.parts.forEach((p, i) => out.push({ key: p.key, title: i === 0 ? q.title : undefined, prompt: p.prompt }));
    } else {
      out.push({ key: q.key, title: q.title, prompt: q.prompt });
    }
  }
  return out;
}
