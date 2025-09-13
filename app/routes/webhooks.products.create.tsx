import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {prisma} from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("➡️ [products/create] incoming", new Date().toISOString());

  // Authenticate (HMAC)
  let topic: string, shop: string, payload: any;
  try {
    ({ topic, shop, payload } = await authenticate.webhook(request));
    console.log("✅ [products/create] authenticated:", topic, shop);
  } catch (e) {
    console.error("❌ [products/create] webhook auth failed:", e);
    return new Response("Unauthorized", { status: 401 });
  }

  // (Optional) ensure topic is what we expect
  if (topic !== "PRODUCTS_CREATE") {
    console.warn("⚠️ [products/create] unexpected topic:", topic);
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
    console.log("✅ [products/create] Prisma connected:", host);
  } catch (e) {
    console.error("❌ [products/create] Prisma connect failed:", e);
    return new Response("DB connect error", { status: 500 });
  }

  // Insert product
    // Upsert product
  try {
    const tenant = shop.toLowerCase();

    await prisma.product.upsert({
      where: {
        tenant_id_shopify_id: {
          tenant_id: tenant,
          shopify_id: String(payload.id),
        },
      },
      create: {
        tenant_id: tenant,
        shopify_id: String(payload.id),
        title: payload.title ?? null,
        price: parseFloat(payload.variants?.[0]?.price ?? "0"),
      },
      update: {
        title: payload.title ?? null,
        price: parseFloat(payload.variants?.[0]?.price ?? "0"),
      },
    });

    console.log("✅ [products/create] product upserted");
  } catch (e) {
    console.error("❌ [products/create] DB upsert failed:", e);
    return new Response("DB upsert error", { status: 500 });
  }


  return new Response("ok", { status: 200 });
};
