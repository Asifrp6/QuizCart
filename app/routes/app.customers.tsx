import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet } from "react-router";
import { authenticate } from "../shopify.server";
import { boundaryHeaders } from "../headers.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function CustomersLayout() {
  return <Outlet />;
}

export const headers: HeadersFunction = boundaryHeaders;
