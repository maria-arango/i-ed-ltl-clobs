/**
 * Read-only rendering of a narrative document (admin view), using the same
 * classes as the editor so red, strikethrough, evidence codes, comment
 * highlights and the review-script columns look identical. Comment anchors
 * carry their number.
 */
import type { CSSProperties, ReactNode } from "react";
import type { PMNode } from "@/lib/narratives/doc";
import { scriptLayout, segmentRoles, type ScriptLayout } from "@/lib/narratives/script-layout";

function renderText(text: string, node: PMNode, key: string, numbers: Map<string, number>, extra?: { cls: string; style?: CSSProperties }): ReactNode {
  let el: ReactNode = text;
  const marks = node.marks ?? [];
  const comments = marks.filter((m) => m.type === "comment").map((m) => String(m.attrs?.commentId));
  if (marks.some((m) => m.type === "strike")) el = <s>{el}</s>;
  const cls = [
    marks.some((m) => m.type === "textColor") ? "nx-red" : "",
    marks.some((m) => m.type === "evidence") ? "nx-evidence" : "",
    comments.length ? "nx-comment" : "",
    extra?.cls ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const title = comments.map((c) => `Comment ${numbers.get(c) ?? "?"}`).join(", ");
  return (
    <span key={key} className={cls || undefined} style={extra?.style} title={title || undefined}>
      {el}
    </span>
  );
}

/** A text run, cut at the script columns when the paragraph is a script line. */
function renderRun(node: PMNode, offset: number, layout: ScriptLayout | null, key: number, numbers: Map<string, number>): ReactNode[] {
  const text = node.text ?? "";
  return segmentRoles(layout, offset, offset + text.length).map((seg) =>
    renderText(
      text.slice(seg.from - offset, seg.to - offset),
      node,
      `${key}-${seg.from}`,
      numbers,
      seg.role === "pre"
        ? { cls: "nx-pre" }
        : seg.role === "tab"
          ? { cls: "nx-tab", style: { "--nx-tab": seg.width } as CSSProperties }
          : undefined,
    ),
  );
}

export function DocView({ doc, commentNumbers }: { doc: PMNode; commentNumbers: Map<string, number> }) {
  const seen = new Set<string>();
  return (
    <div className="nx-doc">
      <div className="ProseMirror">
        {(doc.content ?? []).map((block, i) => {
          const variant = (block.attrs?.variant as string | null | undefined) ?? null;
          const blockText = (block.content ?? []).map((t) => t.text ?? "").join("");
          const layout = block.type === "paragraph" ? scriptLayout(blockText, variant) : null;
          const kids: ReactNode[] = [];
          let offset = 0;
          (block.content ?? []).forEach((t, j) => {
            kids.push(...renderRun(t, offset, layout, j, commentNumbers));
            offset += (t.text ?? "").length;
            for (const m of t.marks ?? []) {
              const id = String(m.attrs?.commentId);
              if (m.type === "comment" && !seen.has(id)) {
                seen.add(id);
                kids.push(
                  <sup key={`c-${id}`} className="ml-0.5 font-semibold text-lake">
                    {commentNumbers.get(id)}
                  </sup>,
                );
              }
            }
          });
          if (block.type === "heading") {
            const level = block.attrs?.level;
            return level === 1 ? <h1 key={i}>{kids}</h1> : level === 3 ? <h3 key={i}>{kids}</h3> : <h2 key={i}>{kids}</h2>;
          }
          return (
            <p
              key={i}
              data-variant={variant ?? undefined}
              className={layout ? `nx-script${layout.kind ? ` nx-${layout.kind}` : ""}` : undefined}
              style={layout ? ({ "--nx-hang": layout.hang } as CSSProperties) : undefined}
            >
              {kids}
            </p>
          );
        })}
      </div>
    </div>
  );
}
