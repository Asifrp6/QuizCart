import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { upsertProductFromWebhook } from "../services/products.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  await upsertProductFromWebhook(
    shop,
    payload as {
      id?: number;
      admin_graphql_api_id?: string;
      title?: string;
      handle?: string;
      status?: string;
      image?: { src?: string } | null;
      variants?: {
        id: number;
        admin_graphql_api_id?: string;
        title?: string;
        price?: string;
      }[];
    },
  );
  return new Response();
};
