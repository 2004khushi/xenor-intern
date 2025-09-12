import { Resend } from "resend";

const resendKey = process.env.RESEND_API_KEY;
const envBase = process.env.APP_BASE_URL ?? "http://localhost:3000";
const fromEmail = process.env.FROM_EMAIL ?? "onboarding@resend.dev";

export async function sendMagicLink(
  email: string,
  token: string,
  baseUrl?: string // <- allow passing the current deployment origin
) {
  // prefer the request origin if provided; trim trailing slashes
  const urlBase = (baseUrl ?? envBase).replace(/\/+$/, "");
  const link = `${urlBase}/login/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  // Always log the link so you can copy it from Vercel logs
  console.log("[mailer] magic link:", link);

  // If no RESEND_API_KEY, we're done (dev mode)
  if (!resendKey) return;

  try {
    const resend = new Resend(resendKey);
    const res = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: "Your sign-in link",
      html: `<p>Click to sign in: <a href="${link}">${link}</a></p>
             <p>This link expires in 15 minutes.</p>`,
    });
    console.log("[mailer] sent id:", (res as any)?.id ?? "ok");
  } catch (e) {
    console.error("[mailer] Resend error:", e);
  }
}
