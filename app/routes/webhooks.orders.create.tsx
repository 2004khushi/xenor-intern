import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  
  console.log("📦 ORDER CREATED!");
  console.log("Shop:", shop);
  console.log("Order data:", payload);

  try {
    await prisma.order.create({
      data: {
        tenant_id: shop,
        shopify_id: payload.id.toString(),
        customer_id: payload.customer?.id?.toString(),
        total_price: parseFloat(payload.total_price || "0"),
        financial_status: payload.financial_status,
      }
    });
    console.log("✅ Order saved to database!");
  } catch (error) {
    console.error("❌ Database error:", error);
  }

  return new Response("Order webhook received!", { status: 200 });
};