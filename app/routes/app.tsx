import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { withShopifyContext } from "../components/app-route-link";
import adminStyles from "../admin.css?url";

export const links = () => [{ rel: "stylesheet", href: adminStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const { search, pathname } = useLocation();

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href={withShopifyContext("/app", search)}>Dashboard</s-link>
        <s-link href={withShopifyContext("/app/quizzes", search)}>
          Quizzes
        </s-link>
        <s-link href={withShopifyContext("/app/products", search)}>
          Products
        </s-link>
        <s-link href={withShopifyContext("/app/customers", search)}>
          Customers
        </s-link>
        <s-link href={withShopifyContext("/app/analytics", search)}>
          Analytics
        </s-link>
        <s-link href={withShopifyContext("/app/appearance", search)}>
          Appearance
        </s-link>
        <s-link href={withShopifyContext("/app/settings", search)}>
          Settings
        </s-link>
      </s-app-nav>
      {pathname !== "/app" && !/^\/app\/quizzes\/[^/]+$/.test(pathname) ? (
        <div className="qc-app-brand-header"><a href={withShopifyContext("/app", search)} aria-label="QuizCart home"><img className="qc-app-logo" src="/quizcart-logo.png" alt="QuizCart" width={96} height={96} /></a></div>
      ) : null}
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const name = error instanceof Error ? "" : error?.constructor?.name;
  if (name === "ErrorResponse" || name === "ErrorResponseImpl") {
    return boundary.error(error);
  }
  const message =
    error instanceof Error ? error.message : "The page failed to load.";
  return (
    <s-page heading="QuizCart">
      <s-section heading="This page did not open">
        <s-paragraph>{message}</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
