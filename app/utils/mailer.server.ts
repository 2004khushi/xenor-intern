import { Resend } from "resend";

const resendKey = process.env.RESEND_API_KEY;
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const fromEmail = process.env.FROM_EMAIL ?? "no-reply@example.com";

export async function sendMagicLink(email: string, token: string) {
  const link = `${baseUrl}/login/verify?token=${encodeURIComponent(
    token
  )}&email=${encodeURIComponent(email)}`;

  if (!resendKey) {
    console.log("[DEV] Magic link (RESEND_API_KEY missing):", link);
    return;
  }

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: "Your sign-in link",
    html: `<p>Click to sign in: <a href="${link}">${link}</a></p>
           <p>This link expires in 15 minutes.</p>`,
  });
}
