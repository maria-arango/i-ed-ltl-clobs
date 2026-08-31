/**
 * Route-change transition (DESIGN_SYSTEM §4: --clobs-dur-page, ease-out).
 * A template remounts on every navigation, so the entering page fades and
 * rises 6px in 280ms. Purely additive: it never delays input, and
 * prefers-reduced-motion collapses it entirely (see globals.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
