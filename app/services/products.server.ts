import prisma from "../db.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  featuredMedia?: {
    preview?: { image?: { url?: string | null } | null } | null;
  } | null;
  variants?: {
    nodes: {
      id: string;
      title: string;
      price: unknown;
      availableForSale: boolean;
    }[];
  };
};

const PRODUCTS_QUERY = `#graphql
  query QuizCartProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
        variants(first: 20) {
          nodes {
            id
            title
            price
            availableForSale
          }
        }
      }
    }
  }
`;

export async function syncProducts(admin: AdminGraphql, shopId: string) {
  let cursor: string | null = null;
  let count = 0;
  let truncated = false;

  for (let page = 0; page < 8; page += 1) {
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: { cursor },
    });
    const json = (await response.json()) as {
      data?: {
        products?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: ProductNode[];
        };
      };
      errors?: { message: string }[];
    };

    if (json.errors?.length) {
      throw new Error(json.errors.map((error) => error.message).join(", "));
    }

    const connection = json.data?.products;
    if (!connection) {
      throw new Error("Shopify did not return a products connection.");
    }

    for (const node of connection.nodes) {
      await upsertProductRecord(shopId, normalizeGraphQLProduct(node));
      count += 1;
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
      break;
    }
    cursor = connection.pageInfo.endCursor;
    if (page === 7) truncated = connection.pageInfo.hasNextPage;
  }

  return { count, truncated };
}

export async function listProducts(shopId: string) {
  return prisma.shopifyProduct.findMany({
    where: { shopId },
    orderBy: { title: "asc" },
    include: { _count: { select: { variants: true } } },
  });
}

export async function upsertProductFromWebhook(
  domain: string,
  payload: {
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
) {
  if (!payload.id && !payload.admin_graphql_api_id) return;
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) return;

  const shopifyId =
    payload.admin_graphql_api_id || `gid://shopify/Product/${payload.id}`;
  const variants = (payload.variants ?? []).map((variant) => ({
    shopifyId:
      variant.admin_graphql_api_id ||
      `gid://shopify/ProductVariant/${variant.id}`,
    title: variant.title || "Default",
    price: variant.price || "",
    available: true,
  }));
  const first = variants[0];

  await upsertProductRecord(shop.id, {
    shopifyId,
    title: payload.title || "Untitled product",
    handle: payload.handle || "",
    imageUrl: payload.image?.src || "",
    status: (payload.status || "active").toUpperCase(),
    price: first?.price || "",
    defaultVariantId: first?.shopifyId || "",
    variants,
  });
}

export async function deleteProductFromWebhook(
  domain: string,
  payload: {
    id?: number;
    admin_graphql_api_id?: string;
  },
) {
  const shopifyId =
    payload.admin_graphql_api_id ||
    (payload.id ? `gid://shopify/Product/${payload.id}` : "");
  if (!shopifyId) return;
  await prisma.shopifyProduct.deleteMany({
    where: { shopifyId, shop: { domain } },
  });
}

function normalizeGraphQLProduct(node: ProductNode) {
  const variants = (node.variants?.nodes ?? []).map((variant) => ({
    shopifyId: variant.id,
    title: variant.title,
    price: money(variant.price),
    available: variant.availableForSale,
  }));
  const preferred =
    variants.find((variant) => variant.available) ?? variants[0];
  return {
    shopifyId: node.id,
    title: node.title,
    handle: node.handle,
    imageUrl: node.featuredMedia?.preview?.image?.url || "",
    status: node.status,
    price: preferred?.price || "",
    defaultVariantId: preferred?.shopifyId || "",
    variants,
  };
}

async function upsertProductRecord(
  shopId: string,
  product: ReturnType<typeof normalizeGraphQLProduct>,
) {
  await prisma.$transaction(async (tx) => {
    const saved = await tx.shopifyProduct.upsert({
      where: { shopId_shopifyId: { shopId, shopifyId: product.shopifyId } },
      create: {
        shopId,
        shopifyId: product.shopifyId,
        title: product.title,
        handle: product.handle,
        imageUrl: product.imageUrl,
        status: product.status,
        price: product.price,
        defaultVariantId: product.defaultVariantId,
      },
      update: {
        title: product.title,
        handle: product.handle,
        imageUrl: product.imageUrl,
        status: product.status,
        price: product.price,
        defaultVariantId: product.defaultVariantId,
      },
    });

    await tx.shopifyVariant.deleteMany({ where: { productId: saved.id } });
    if (product.variants.length) {
      await tx.shopifyVariant.createMany({
        data: product.variants.map((variant) => ({
          productId: saved.id,
          shopifyId: variant.shopifyId,
          title: variant.title,
          price: variant.price,
          available: variant.available,
        })),
      });
    }
  });
}

function money(value: unknown): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (value && typeof value === "object" && "amount" in value) {
    return String((value as { amount: unknown }).amount ?? "");
  }
  return "";
}
