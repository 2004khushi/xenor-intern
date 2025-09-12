import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { consumeMagicLink } from "../utils/auth.server";
import { createUserSession } from "../utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const email = (url.searchParams.get("email") || "").toLowerCase();

  if (!token || !email) {
    return redirect("/login");
  }

  try {
    const verifiedEmail = await consumeMagicLink(email, token);
    const cookie = await createUserSession(verifiedEmail);
    return redirect("/dashboard", { headers: { "Set-Cookie": cookie } });
  } catch (e: any) {
    return json({ error: e?.message ?? "Invalid link" }, { status: 400 });
  }
}
