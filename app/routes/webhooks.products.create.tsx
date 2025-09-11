import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  
  console.log("🛍️  PRODUCT CREATED!");
  console.log("Shop:", shop);
  console.log("Product data:", payload);

  return new Response("Product webhook received!", { status: 200 });
};