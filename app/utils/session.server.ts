import { createCookieSessionStorage, redirect } from "@remix-run/node";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required");
}

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    secrets: [process.env.SESSION_SECRET],
  },
});

export async function getUserEmail(request: Request) {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  return session.get("userEmail") as string | undefined;
}

export async function requireUserEmail(request: Request) {
  const email = await getUserEmail(request);
  if (!email) throw redirect("/login");
  return email;
}

export async function createUserSession(email: string) {
  const session = await sessionStorage.getSession();
  session.set("userEmail", email);
  return await sessionStorage.commitSession(session);
}

export async function logout(request: Request) {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  return redirect("/login", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(session) },
  });
}
