import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteProductFromWebhook } from "../services/products.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  await deleteProductFromWebhook(
    shop,
    payload as { id?: number; admin_graphql_api_id?: string },
  );
  return new Response();
};
