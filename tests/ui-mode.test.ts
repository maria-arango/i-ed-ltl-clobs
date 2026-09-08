/** Which interface an account gets (Amendment §46). Pure. */
import { describe, expect, it } from "vitest";
import { resolveUiMode } from "@/lib/ui-mode";
import { driveFileId } from "@/components/workspace/video-theatre";

describe("resolveUiMode", () => {
  it("auto follows the device; explicit preferences win", () => {
    expect(resolveUiMode("auto", "phone")).toBe("simple");
    expect(resolveUiMode("auto", "tablet")).toBe("simple");
    expect(resolveUiMode("auto", "desktop")).toBe("full");
    expect(resolveUiMode("auto", "unknown")).toBe("full");
    expect(resolveUiMode(null, "phone")).toBe("simple");
    expect(resolveUiMode("simple", "desktop")).toBe("simple");
    expect(resolveUiMode("full", "phone")).toBe("full");
  });
});

describe("driveFileId (embedding, docs/08 §3b)", () => {
  it("extracts the id from the link shapes Drive produces", () => {
    expect(driveFileId("https://drive.google.com/file/d/1Atx7HqAu79n7odZnhSkMGI6emXA00CPB/view")).toBe(
      "1Atx7HqAu79n7odZnhSkMGI6emXA00CPB",
    );
    expect(driveFileId("https://drive.google.com/file/d/ABCDEFGHIJKLMNOP/view?usp=sharing")).toBe("ABCDEFGHIJKLMNOP");
    expect(driveFileId("https://drive.google.com/open?id=ABCDEFGHIJKLMNOP")).toBe("ABCDEFGHIJKLMNOP");
    expect(driveFileId("https://drive.google.com/drive/folders/xyz")).toBeNull();
    expect(driveFileId(null)).toBeNull();
  });
});
