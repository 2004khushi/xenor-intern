import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  
  console.log("👤 CUSTOMER CREATED!");
  console.log("Shop:", shop);
  console.log("Customer data:", payload);

  try {
    await prisma.customer.create({
      data: {
        tenant_id: shop,
        shopify_id: payload.id.toString(),
        email: payload.email,
        first_name: payload.first_name,
        last_name: payload.last_name,
      }
    });
    console.log("✅ Customer saved to database!");
  } catch (error) {
    console.error("❌ Database error:", error);
  }

  return new Response("Customer webhook received!", { status: 200 });
};