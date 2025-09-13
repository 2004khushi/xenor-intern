import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { createLoginSession, verifyMagicLink } from "app/utils/auth.server";


export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const email = url.searchParams.get("email") || "";

  try {
    const userId = await verifyMagicLink(token, email);
    const setCookie = await createLoginSession(userId);
    return redirect("/portal", { headers: { "Set-Cookie": setCookie } });
  } catch {
    return redirect("/login?error=invalid_link");
  }
}

export default function Verify() { return null; }