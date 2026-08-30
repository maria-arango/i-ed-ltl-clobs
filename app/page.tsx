import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper p-8">
      <h1
        className="font-serif text-ink"
        style={{
          fontSize: "var(--clobs-text-display)",
          lineHeight: "var(--clobs-leading-display)",
          letterSpacing: "var(--clobs-tracking-display)",
        }}
      >
        LTL CLOBS
      </h1>
      <p className="max-w-prose text-center text-graphite">
        Classroom observation coding platform for the LTL Secondary project.
        The application is under construction; the sign-in page arrives in a
        later build stage.
      </p>
      <Link
        href="/styleguide"
        className="rounded-md px-1 text-lake underline underline-offset-4"
      >
        View the style guide
      </Link>
    </main>
  );
}
