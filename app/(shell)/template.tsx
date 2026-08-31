/**
 * Content-pane transition (DESIGN_SYSTEM §4): a template remounts on every
 * navigation, so the entering CONTENT fades and rises 6px in 280ms while
 * the sidebar and top bar (in layout.tsx) stay perfectly still. Never
 * delays input; prefers-reduced-motion collapses it (globals.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
