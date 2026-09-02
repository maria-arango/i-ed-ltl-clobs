/**
 * Ambient photograph tiles for the workspace's quiet right rail (María,
 * 2026-09-01): Kimanya imagery drifting gently, like the sign-in page's
 * character brought inside. Decoration only — hidden from screen readers,
 * hidden below xl, still under prefers-reduced-motion (globals).
 */
/* Deliberately scattered (María, 2026-09-01): offsets, widths and tilts
   all differ, so the rail reads as pinned photographs, not a list. */
const TILES = [
  {
    src: "/kimanya/kimanya-02-discussion.webp",
    tilt: "-3deg",
    delay: "0s",
    className: "w-[82%] self-start",
  },
  {
    src: "/kimanya/kimanya-05-classroom.webp",
    tilt: "2.4deg",
    delay: "1.4s",
    className: "-mt-7 w-[68%] self-end",
  },
  {
    src: "/kimanya/kimanya-03-study-circle.jpg",
    tilt: "-1.6deg",
    delay: "2.6s",
    className: "-mt-4 ml-4 w-[74%] self-center",
  },
];

export function FloatingTiles() {
  return (
    <aside
      aria-hidden
      className="pointer-events-none hidden select-none xl:block"
    >
      <div className="sticky top-10 flex flex-col pl-4 pt-6">
        {TILES.map((tile) => (
          <div
            key={tile.src}
            className={`float-tile elev-card overflow-hidden rounded-2xl border border-hairline ${tile.className}`}
            style={
              {
                "--tile-tilt": tile.tilt,
                animationDelay: tile.delay,
              } as React.CSSProperties
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tile.src}
              alt=""
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
              style={{ filter: "saturate(0.92)" }}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}
