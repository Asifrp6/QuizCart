import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";

const SHOPIFY_CONTEXT_PARAMS = ["shop", "host", "embedded", "locale"] as const;

export function withShopifyContext(href: string, search: string) {
  const destination = new URL(href, "https://quizcart.local");
  const currentParams = new URLSearchParams(search);

  for (const name of SHOPIFY_CONTEXT_PARAMS) {
    const value = currentParams.get(name);
    if (value && !destination.searchParams.has(name)) {
      destination.searchParams.set(name, value);
    }
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function AppRouteLink({
  href,
  children,
  ...attributes
}: {
  href: string;
  children: ReactNode;
  className?: string;
  role?: string;
  "aria-label"?: string;
  "aria-current"?: "page";
  "aria-selected"?: boolean;
}) {
  const { search } = useLocation();
  const contextualHref = withShopifyContext(href, search);

  return (
    <Link to={contextualHref} {...attributes}>
      {children}
    </Link>
  );
}
