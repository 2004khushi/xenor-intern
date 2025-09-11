import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  
  console.log("👤 CUSTOMER CREATED!");
  console.log("Shop:", shop);
  console.log("Customer data:", payload);

  // TODO: Save customer to database with tenant_id = shop

  return new Response("Customer webhook received!", { status: 200 });
};