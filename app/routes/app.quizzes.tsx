import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet } from "react-router";
import { authenticate } from "../shopify.server";
import { boundaryHeaders } from "../headers.server";
import storefrontPreviewStyles from "../components/quizcart-preview.css?url";
import previewStyles from "../components/quiz-preview.css?url";

export const links = () => [
  { rel: "stylesheet", href: storefrontPreviewStyles },
  { rel: "stylesheet", href: previewStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function QuizzesLayout() {
  return <Outlet />;
}

export const headers: HeadersFunction = boundaryHeaders;
