/**
 * Synthetic narratives in the HAPI pipeline's exact NARRATIVE.md format
 * (decision D7: placeholders until the final set is chosen). Everything is
 * invented — lesson, speech, people — and the lesson ids (999xx_n) match
 * no school. Deterministic for a given seed, so tests and the committed
 * seed files are reproducible.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOPICS: Record<string, { subject: string; lines: string[]; replies: string[] }> = {
  photosynthesis: {
    subject: "Biology",
    lines: [
      "Who can tell us what a leaf needs in order to make food?",
      "We said the green colour comes from chlorophyll. What does chlorophyll do?",
      "Write this down: carbon dioxide plus water, in the presence of light, gives glucose and oxygen.",
      "Look at the diagram on the board. Where does the light enter?",
      "Very good. Let us give her a round of applause.",
      "Now discuss with your neighbour why plants kept in the dark turn yellow.",
    ],
    replies: ["Sunlight", "Chlorophyll absorbs light", "It makes food", "Yes", "Oxygen"],
  },
  acids: {
    subject: "Chemistry",
    lines: [
      "What colour does blue litmus paper turn in an acid?",
      "Give me an example of an acid we find at home.",
      "When an acid reacts with a base, what do we get?",
      "Copy the table into your books: indicator, colour in acid, colour in base.",
      "Who has not yet answered today? Yes, you at the back.",
      "Be careful with the words. We say neutralisation, not neutralise.",
    ],
    replies: ["Red", "Lemon juice", "Salt and water", "Neutralisation", "Vinegar"],
  },
  rivers: {
    subject: "Geography",
    lines: [
      "What is the name of the place where a river begins?",
      "We have the upper course, the middle course and the lower course. Which one is fastest?",
      "Look at your atlas, page twelve. Find the longest river in East Africa.",
      "Why do people settle near rivers? Think about farming.",
      "Good attempt. Who can add something to what he said?",
      "In groups, draw a meander and label the inner and outer bank.",
    ],
    replies: ["The source", "The upper course", "The Nile", "For water", "Fishing"],
  },
};

const ACTIONS = [
  "The teacher, A1, stands at the front of the classroom near the blackboard",
  "The teacher walks along the central aisle, looking at the students' books",
  "The teacher writes on the left panel of the blackboard",
  "The teacher points to the diagram on the board",
  "Most students look towards the teacher while a few write in their books",
  "The teacher moves to the right side of the room near the windows",
  "A student at the front raises her hand",
  "Several students raise their hands",
];
const SOUNDS = [
  "The teacher's voice is clear over quiet classroom noise",
  "Background chatter rises briefly and then settles",
  "The class is quiet apart from the sound of writing",
  "Students murmur as they discuss in pairs",
];

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function makePlaceholderNarrative(opts: {
  lessonId: string;
  topic: keyof typeof TOPICS;
  episodes: number;
  seed: number;
}): string {
  const r = rng(opts.seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const topic = TOPICS[opts.topic];
  let t = 0;
  let w = 1;
  let n = 1;
  let c = 1;
  const code = (k: string) => `W${String(w).padStart(2, "0")}-${k}${String(n++).padStart(4, "0")}`;
  const episodes: string[] = [];
  for (let e = 1; e <= opts.episodes; e++) {
    const len = 20 + Math.floor(r() * 40);
    const start = t;
    t += len;
    if (e % 8 === 0) w++;
    const used: string[] = [];
    const cite = (k: string) => {
      const x = code(k);
      used.push(x);
      return x;
    };
    const sentences = [
      `${pick(SOUNDS)} [${cite("S")}].`,
      `${pick(ACTIONS)} [${cite("V")}, ${cite("I")}].`,
      `He asks, «${pick(topic.lines)}» [${cite("U")}, ${cite("R")}].`,
      `A student answers, «${pick(topic.replies)}» [${cite("U")}, ${cite("R")}].`,
    ];
    if (r() < 0.3) {
      const corr = `C${String(c++).padStart(4, "0")}`;
      used.push(corr);
      sentences.push(`It is unclear from the recording whether the answer came from the same student [${corr}].`);
    }
    if (r() < 0.5) sentences.push(`He continues, «${pick(topic.lines)}» [${cite("U")}, ${cite("R")}].`);
    episodes.push(
      `--- E${String(e).padStart(2, "0")} [${mmss(start)}-${mmss(t)}] ---\n` +
        `${sentences.join(" ")}\n(covers: ${used.join(", ")})`,
    );
  }
  const duration = mmss(t);
  const open = Math.floor(r() * 3);
  return [
    `=== LESSON NARRATIVE — ${opts.lessonId} (duration ${duration}) ===`,
    "A VIEW of the evidence ledger, never a replacement — every claim cites",
    "ledger record IDs; any conflict between this narrative and the ledger is",
    "a bug in the narrative. Uncertainties are stated inline, never omitted.",
    open === 0
      ? "Evidence state: complete and audited; no questions about this lesson remain open."
      : `Evidence state: complete and audited; ${open} question(s) about this lesson remain open — each is stated inline where it occurs.`,
    "",
    "GIVEN FACTS SUPPLIED BY THE CONTEXT CARD (not observed by the pipeline; the passes were told to treat these as fact):",
    `  [given] 00:00 - ${duration} — A1 is in the classroom`,
    `  [given] 00:00 - 00:40 — A1 stands at the front of the classroom by the blackboard`,
    `  [given] 03:10 - 03:25 — A student walks to the board and writes an answer, then returns to her seat`,
    "Everything else below was derived by the pipeline from the recording.",
    "",
    episodes.join("\n\n"),
    "",
  ].join("\n");
}

export const PLACEHOLDERS = [
  { file: "placeholder-99901_1.md", lessonId: "99901_1", topic: "photosynthesis", episodes: 60, seed: 11 },
  { file: "placeholder-99902_7.md", lessonId: "99902_7", topic: "acids", episodes: 40, seed: 22 },
  { file: "placeholder-99903_12.md", lessonId: "99903_12", topic: "rivers", episodes: 25, seed: 33 },
] as const;
