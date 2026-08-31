/**
 * The one transactional-mail interface (ADR 0001: "one transactional
 * provider behind a single-function interface"). Everything that sends
 * email goes through here; swapping providers means editing this file only.
 *
 * Uses the Resend REST API directly — no SDK dependency.
 * In development without RESEND_API_KEY, the code is printed to the server
 * terminal instead, so local sign-in never depends on email delivery.
 */

export async function sendSignInCode(
  to: string,
  code: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY and EMAIL_FROM must be set in production.",
      );
    }
    console.log(`\n[dev] Sign-in code for ${to}: ${code}\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `LTL Classroom Observations <${from}>`,
      to: [to],
      subject: `${code} is your sign-in code`,
      text: [
        `Your sign-in code is: ${code}`,
        "",
        "It expires in 15 minutes. If you did not request it, ignore this email.",
      ].join("\n"),
      html: [
        `<p>Your sign-in code is:</p>`,
        `<p style="font-size:28px;font-family:monospace;letter-spacing:4px;margin:16px 0"><strong>${code}</strong></p>`,
        `<p>It expires in 15 minutes. If you did not request it, ignore this email.</p>`,
      ].join(""),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend refused the email (${res.status}): ${body}`);
  }
}
