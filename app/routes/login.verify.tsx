// routes/login.verify.tsx
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { verifyMagicLink, createLoginSession } from "app/utils/auth.server";


export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const email = url.searchParams.get("email") ?? "";

  if (!token || !email) return redirect("/login");

  try {
    const userId = await verifyMagicLink(token, email);
    const setCookie = await createLoginSession(userId);
    return redirect("/dashboard", { headers: { "Set-Cookie": setCookie } });
  } catch {
    return redirect("/login?error=invalid_link");
  }
}

export default function Verify() { return null; }
