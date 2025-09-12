import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  
  console.log("🛍️ PRODUCT CREATED!");
  console.log("Shop:", shop);
  console.log("Product data:", payload);

  try {
    await prisma.product.create({
      data: {
        tenant_id: shop,
        shopify_id: payload.id.toString(),
        title: payload.title,
        price: parseFloat(payload.variants?.[0]?.price || "0"),
      }
    });
    console.log("✅ Product saved to database!");
  } catch (error) {
    console.error("❌ Database error:", error);
  }

  return new Response("Product webhook received!", { status: 200 });
};