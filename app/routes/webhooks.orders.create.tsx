import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  
  console.log("📦 ORDER CREATED!");
  console.log("Shop:", shop);
  console.log("Order data:", payload);

  // TODO: Save order to database with tenant_id = shop

  return new Response("Order webhook received!", { status: 200 });
};