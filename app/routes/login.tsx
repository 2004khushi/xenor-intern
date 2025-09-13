import { Form, useActionData, useNavigation } from "@remix-run/react";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { sendMagicLink } from "app/utils/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") || "");
  try {
    await sendMagicLink(email);
    return json({ ok: true, msg: "Magic link sent. Check your email." });
  } catch (e: any) {
    return json({ ok: false, msg: e.message ?? "Failed to send link" }, { status: 400 });
  }
}

export default function Login() {
  const res = useActionData<typeof action>();
  const nav = useNavigation();
  return (
    <div style={{ maxWidth: 380, margin: "3rem auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>Sign in</h1>
      <Form method="post" style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <input type="email" name="email" required placeholder="you@example.com" />
        <button type="submit" disabled={nav.state !== "idle"}>
          {nav.state === "submitting" ? "Sending…" : "Send magic link"}
        </button>
      </Form>
      {res?.msg && (
        <p style={{ color: res.ok ? "green" : "crimson", marginTop: 8 }}>{res.msg}</p>
      )}
    </div>
  );
}
