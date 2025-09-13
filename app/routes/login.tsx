// app/routes/login.tsx
import { redirect, json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { prisma } from "../db.server";

// Define store interface to fix TypeScript error
interface Store {
  id: string;
  name: string;
  domain: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Check if tenant is already selected
  const cookieHeader = request.headers.get("Cookie");
  const cookies = new Map(
    cookieHeader?.split(';').map(c => {
      const [key, value] = c.trim().split('=');
      return [key, value];
    }) || []
  );
  
  if (cookies.get('tenant_id')) {
    return redirect("/dashboard");
  }

  // Get all available stores/tenants
  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      domain: true
    }
  });

  return json({ stores });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const storeId = formData.get("storeId") as string;
  
  if (!storeId) {
    return json({ error: "Please select a store" }, { status: 400 });
  }

  // Set the tenant identifier in session
  return redirect("/dashboard", {
    headers: {
      "Set-Cookie": `tenant_id=${storeId}; Path=/; HttpOnly; SameSite=Lax`
    }
  });
}

export default function LoginPage() {
  const data = useLoaderData<{ stores: Store[] }>();
  const { stores } = data;

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold mb-4">Select Store</h1>
      <Form method="post" className="space-y-3">
        <select
          name="storeId"
          required
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Select a store</option>
          {stores.map((store: Store) => (
            <option key={store.id} value={store.id}>
              {store.name} ({store.domain})
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="w-full rounded bg-black text-white py-2"
        >
          Enter Dashboard
        </button>
      </Form>
    </div>
  );
}