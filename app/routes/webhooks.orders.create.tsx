import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("🔔 Webhook received at:", new Date().toISOString());
  
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    console.log("✅ Auth success. Topic:", topic, "Shop:", shop);
    
    // TEST: Try a simple insert
    if (topic === "PRODUCTS_CREATE") {
      await prisma.product.create({
        data: {
          tenant_id: shop,
          shopify_id: "test-from-webhook",
          title: "Test from Webhook",
          price: 9.99
        }
      });
    }
    
    console.log("✅ TEST INSERT WORKED!");
    
  } catch (error) {
    console.error("❌ FULL ERROR:", error);
  }
  
  return new Response("Received");
};