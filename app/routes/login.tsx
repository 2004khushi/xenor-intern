// app/routes/login.tsx
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { issueMagicLink } from "../utils/auth.server";
import { getUserEmail } from "../utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const email = await getUserEmail(request);
  if (email) return redirect("/dashboard");
  return json({ ok: true });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return json({ error: "Enter a valid email" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  await issueMagicLink(email, origin);

  return json({ success: true });
}

export default function LoginPage() {
  const data = useActionData<typeof action>();
  
  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold mb-4">Sign in</h1>
      <Form method="post" className="space-y-3">
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          className="w-full border rounded px-3 py-2"
          required
        />
        <button
          type="submit"
          className="w-full rounded bg-black text-white py-2"
        >
          Send magic link
        </button>
      </Form>
      
      {/* FIXED: Check if data exists first */}
      {data && 'success' in data && data.success && (
        <p className="mt-3 text-green-700">
          Check your email for the sign-in link (or see server logs in dev).
        </p>
      )}
      
      {/* FIXED: Check if data exists first */}
      {data && 'error' in data && (
        <p className="mt-3 text-red-700">{data.error}</p>
      )}
    </div>
  );
}