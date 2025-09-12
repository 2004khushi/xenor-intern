import { randomUUID } from "crypto";
import prisma from "../db.server";
import { sendMagicLink } from "./mailer.server";

export async function issueMagicLink(email: string) {
  const token = randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.magicLinkToken.create({
    data: { email: email.toLowerCase(), token, expiresAt },
  });

  await sendMagicLink(email, token);
}

export async function consumeMagicLink(email: string, token: string) {
  const row = await prisma.magicLinkToken.findFirst({
    where: { email: email.toLowerCase(), token, usedAt: null },
  });
  if (!row) throw new Error("Invalid or already used token");
  if (row.expiresAt < new Date()) throw new Error("Token expired");

  await prisma.$transaction([
    prisma.magicLinkToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.upsert({
      where: { email: email.toLowerCase() },
      create: { email: email.toLowerCase() },
      update: {},
    }),
  ]);

  return email.toLowerCase();
}
