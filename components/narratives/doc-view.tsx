/**
 * Read-only rendering of a narrative document (admin view), using the same
 * classes as the editor so red, strikethrough, evidence codes and comment
 * highlights look identical. Comment anchors carry their number.
 */
import type { ReactNode } from "react";
import type { PMNode } from "@/lib/narratives/doc";

function renderText(node: PMNode, key: number, numbers: Map<string, number>): ReactNode {
  let el: ReactNode = node.text;
  const marks = node.marks ?? [];
  const comments = marks.filter((m) => m.type === "comment").map((m) => String(m.attrs?.commentId));
  if (marks.some((m) => m.type === "strike")) el = <s>{el}</s>;
  const cls = [
    marks.some((m) => m.type === "textColor") ? "nx-red" : "",
    marks.some((m) => m.type === "evidence") ? "nx-evidence" : "",
    comments.length ? "nx-comment" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const title = comments.map((c) => `Comment ${numbers.get(c) ?? "?"}`).join(", ");
  return (
    <span key={key} className={cls || undefined} title={title || undefined}>
      {el}
    </span>
  );
}

export function DocView({ doc, commentNumbers }: { doc: PMNode; commentNumbers: Map<string, number> }) {
  const seen = new Set<string>();
  return (
    <div className="nx-doc">
      <div className="ProseMirror">
        {(doc.content ?? []).map((block, i) => {
          const kids: ReactNode[] = [];
          (block.content ?? []).forEach((t, j) => {
            kids.push(renderText(t, j, commentNumbers));
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
            return block.attrs?.level === 1 ? <h1 key={i}>{kids}</h1> : <h2 key={i}>{kids}</h2>;
          }
          return (
            <p key={i} data-variant={(block.attrs?.variant as string) ?? undefined}>
              {kids}
            </p>
          );
        })}
      </div>
    </div>
  );
}
