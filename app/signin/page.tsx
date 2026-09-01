/**
 * Sign-in. When Kimanya photographs exist in public/kimanya/, the page
 * splits: the sign-in flow on the left, a photograph of the local context
 * on the right (Amendment B §21; the brief's wish to connect coders to
 * their local context). Without photos it stays a single centered column.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { TiltCard } from "@/components/ui/tilt-card";
import { RequestAccess } from "./request-access";
import { SignInClient } from "./signin-client";

function findKimanyaPhoto(): string | null {
  try {
    const dir = path.join(process.cwd(), "public", "kimanya");
    const files = readdirSync(dir)
      .filter((f) => /\.(webp|jpe?g|png)$/i.test(f))
      .sort();
    return files.length > 0 ? `/kimanya/${files[0]}` : null;
  } catch {
    return null;
  }
}

export default function SignInPage() {
  const photo = findKimanyaPhoto();

  if (!photo)
    return (
      <div className="relative">
        <SignInClient />
        <RequestAccess />
      </div>
    );

  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-2">
      <div className="relative">
        <SignInClient />
        <RequestAccess />
      </div>
      <aside
        className="relative hidden overflow-hidden p-6 lg:block"
        aria-label="Kimanya-Ngeyo"
      >
        <TiltCard className="relative h-full w-full overflow-hidden rounded-2xl border border-hairline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt="A classroom of the Kimanya-Ngeyo Foundation in Uganda"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <p className="absolute bottom-0 left-0 right-0 bg-sunken/95 px-6 py-3 text-[13px] text-graphite">
            Kimanya-Ngeyo Foundation for Science and Education, Uganda
          </p>
        </TiltCard>
      </aside>
    </div>
  );
}
