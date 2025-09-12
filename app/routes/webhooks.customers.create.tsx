import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("🔄 Webhook received at:", new Date().toISOString());
  
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    console.log("👤 CUSTOMER CREATED!");
    console.log("Shop:", shop);
    console.log("Customer data:", JSON.stringify(payload, null, 2));
    
    // TODO: Save customer to database with tenant_id = shop
    
    return new Response("Webhook received!", { status: 200 });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return new Response("Webhook failed", { status: 500 });
  }
};