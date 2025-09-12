import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("➡️ [orders/create] incoming", new Date().toISOString());

  // Authenticate (HMAC)
  let topic: string, shop: string, payload: any;
  try {
    ({ topic, shop, payload } = await authenticate.webhook(request));
    console.log("✅ [orders/create] authenticated:", topic, shop);
  } catch (e) {
    console.error("❌ [orders/create] webhook auth failed:", e);
    return new Response("Unauthorized", { status: 401 });
  }

  if (topic !== "ORDERS_CREATE") {
    console.warn("⚠️ [orders/create] unexpected topic:", topic);
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
    console.log("✅ [orders/create] Prisma connected:", host);
  } catch (e) {
    console.error("❌ [orders/create] Prisma connect failed:", e);
    return new Response("DB connect error", { status: 500 });
  }

  // Insert order
  try {
    await prisma.order.create({
      data: {
        tenant_id: shop,
        shopify_id: String(payload.id),
        customer_id: payload.customer?.id ? String(payload.customer.id) : null,
        total_price: Number(payload.total_price ?? 0),
        financial_status: payload.financial_status ?? null,
      },
    });
    console.log("✅ [orders/create] order saved");
  } catch (e) {
    console.error("❌ [orders/create] DB insert failed:", e);
    return new Response("DB insert error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
};
