import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundaryHeaders } from "../headers.server";
import { appRedirect } from "../lib/app-redirect.server";
import { ensureShop } from "../services/shop.server";
import { listProducts, syncProducts } from "../services/products.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const url = new URL(request.url);
  const count = Number(url.searchParams.get("synced") ?? 0);
  return {
    products: await listProducts(shop.id),
    syncSucceeded: url.searchParams.has("synced"),
    syncCount: Number.isFinite(count) ? count : 0,
    truncated: url.searchParams.get("truncated") === "true",
    syncError: url.searchParams.get("sync") === "failed",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  try {
    const result = await syncProducts(admin, shop.id);
    const query = new URLSearchParams({
      synced: String(result.count),
      truncated: String(result.truncated),
    });
    return appRedirect(request, `/app/products?${query}`);
  } catch (error) {
    console.error("QuizCart product sync failed", error);
    return appRedirect(request, "/app/products?sync=failed");
  }
};

export default function ProductsPage() {
  const { products, syncSucceeded, syncCount, truncated, syncError } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Products">
      <s-section>
        <Form method="post">
          <s-button type="submit" variant="primary">
            Sync from Shopify
          </s-button>
        </Form>
      </s-section>
      {syncSucceeded ? (
        <s-banner tone="success" heading="Products synced">
          Synced {syncCount} products from Shopify.
        </s-banner>
      ) : null}
      {syncError ? (
        <s-banner tone="critical" heading="Sync failed">
          QuizCart could not sync your Shopify catalog. Try again, and check the
          app server logs if the problem continues.
        </s-banner>
      ) : null}
      {truncated ? (
        <s-banner tone="warning" heading="Catalog was truncated">
          QuizCart stored the first 400 products. Later changes still arrive
          through product webhooks.
        </s-banner>
      ) : null}
      <s-section heading="Catalog used for recommendations">
        <s-paragraph>
          Mapped answers can only recommend products stored here. Sync after you
          install the app, then product updates keep the list current.
        </s-paragraph>
        {products.length === 0 ? (
          <s-paragraph>No products synced yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header listSlot="labeled">Status</s-table-header>
              <s-table-header listSlot="labeled">Price</s-table-header>
              <s-table-header listSlot="labeled">Variants</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {products.map((product) => (
                <s-table-row key={product.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="base" alignItems="center">
                      {product.imageUrl ? (
                        <s-thumbnail
                          src={product.imageUrl}
                          alt={product.title}
                          size="small"
                        />
                      ) : null}
                      {product.title}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{product.status}</s-table-cell>
                  <s-table-cell>{product.price || "—"}</s-table-cell>
                  <s-table-cell>{product._count.variants}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = boundaryHeaders;
