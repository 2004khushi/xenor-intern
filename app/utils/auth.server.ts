import { createHash, randomBytes } from "crypto";
import { prisma } from "app/db.server";
import { createCookieSessionStorage, redirect } from "@remix-run/node";
import { z } from "zod";


// ----- Session cookies -----
const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    secrets: [process.env.SESSION_SECRET!],
  },
});

export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}
export async function commitSession(session: any) {
  return sessionStorage.commitSession(session);
}
export async function destroySession(session: any) {
  return sessionStorage.destroySession(session);
}
export async function requireUserId(request: Request) {
  const session = await getSession(request);
  const userId = session.get("userId");
  if (!userId) throw redirect("/login");
  return userId as string; // string IDs in your schema
}

// ----- Helpers -----
const APP_URL = process.env.APP_URL!;
const DEV_LOG = process.env.DEV_LOG_MAGIC_LINK === "true";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function genToken(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

async function sendEmail(to: string, subject: string, text: string, html?: string) {
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to, subject, text, html: html ?? `<pre>${text}</pre>`,
      }),
    });
    if (!res.ok) throw new Error("Failed to send email");
    return;
  }
  console.warn("No email provider configured. Logging magic link below.");
  console.log(text);
}

// ----- sendMagicLink (creates hashed token in DB) -----
export async function sendMagicLink(rawEmail: string) {
  const email = String(rawEmail).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");

  // simple rate-limit: one issue / 30s
  const recent = await prisma.magicLinkToken.findFirst({
    where: { email, createdAt: { gt: new Date(Date.now() - 30_000) } },
  });
  if (recent) throw new Error("Please wait a moment before requesting another link.");

  const token = genToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 15 * 60_000);

  await prisma.magicLinkToken.create({
    data: { email, tokenHash, expiresAt }, // matches your schema
  });

  const url = new URL("/auth/verify", APP_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("email", email);

  if (DEV_LOG) console.log("🔗 DEV magic link:", url.toString());

  await sendEmail(
    email,
    "Your sign-in link",
    `Click to sign in: ${url.toString()}\nThis link expires in 15 minutes.`,
    `<p>Click to sign in:</p><p><a href="${url.toString()}">${url.toString()}</a></p><p>This link expires in 15 minutes.</p>`
  );

  return true;
}

// ----- verifyMagicLink (checks tokenHash, single use via consumedAt) -----
export async function verifyMagicLink(token: string, email: string) {
  const tokenHash = hashToken(token);

  const rec = await prisma.magicLinkToken.findUnique({
    where: { tokenHash }, // @unique in your schema
  });

  if (
    !rec ||
    rec.email.toLowerCase() !== String(email).toLowerCase() ||
    rec.expiresAt < new Date() ||
    rec.consumedAt
  ) {
    // optional: bump attempts if found-but-bad
    if (rec) {
      await prisma.magicLinkToken.update({
        where: { tokenHash },
        data: { attempts: rec.attempts + 1 },
      });
    }
    throw new Error("Invalid or expired link.");
  }

  // mark consumed (single-use)
  await prisma.magicLinkToken.update({
    where: { tokenHash },
    data: { consumedAt: new Date() },
  });

  // find-or-create user
  let user = await prisma.user.findUnique({ where: { email: rec.email } });
  if (!user) user = await prisma.user.create({ data: { email: rec.email } });

  return user.id; // string
}

// ----- create session cookie -----
export async function createLoginSession(userId: string) {
  const ttlDays = 30;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { userId, expiresAt },
  });

  const session = await sessionStorage.getSession();
  session.set("userId", userId);
  return commitSession(session);
}

// optional logout helper
export async function signOut(request: Request) {
  const session = await getSession(request);
  return destroySession(session);
}

