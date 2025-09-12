import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("➡️ [customers/create] incoming", new Date().toISOString());

  // Authenticate (HMAC)
  let topic: string, shop: string, payload: any;
  try {
    ({ topic, shop, payload } = await authenticate.webhook(request));
    console.log("✅ [customers/create] authenticated:", topic, shop);
  } catch (e) {
    console.error("❌ [customers/create] webhook auth failed:", e);
    return new Response("Unauthorized", { status: 401 });
  }

  if (topic !== "CUSTOMERS_CREATE") {
    console.warn("⚠️ [customers/create] unexpected topic:", topic);
  }

  // Ensure Prisma can connect (temporary debug)
  try {
    await prisma.$connect();
    const host = (() => {
      try {
        return new URL(process.env.DATABASE_URL || "").host;
      } catch {
        return "unknown-host";
      }
    })();
    console.log("✅ [customers/create] Prisma connected:", host);
  } catch (e) {
    console.error("❌ [customers/create] Prisma connect failed:", e);
    return new Response("DB connect error", { status: 500 });
  }

  // Insert customer
    // Upsert customer
  try {
    const tenant = shop.toLowerCase();

    await prisma.customer.upsert({
      where: {
        tenant_id_shopify_id: {
          tenant_id: tenant,
          shopify_id: String(payload.id),
        },
      },
      create: {
        tenant_id: tenant,
        shopify_id: String(payload.id),
        email: payload.email ?? null,
        first_name: payload.first_name ?? null,
        last_name: payload.last_name ?? null,
      },
      update: {
        email: payload.email ?? null,
        first_name: payload.first_name ?? null,
        last_name: payload.last_name ?? null,
      },
    });

    console.log("✅ [customers/create] customer upserted");
  } catch (e) {
    console.error("❌ [customers/create] DB upsert failed:", e);
    return new Response("DB upsert error", { status: 500 });
  }


  return new Response("ok", { status: 200 });
};
