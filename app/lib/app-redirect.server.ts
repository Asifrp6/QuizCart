import { redirect } from "react-router";

const SHOPIFY_CONTEXT_PARAMS = ["shop", "host", "embedded", "locale"] as const;

export function appRedirect(request: Request, href: string) {
  const source = new URL(request.url);
  const destination = new URL(href, source);

  for (const name of SHOPIFY_CONTEXT_PARAMS) {
    const value = source.searchParams.get(name);
    if (value && !destination.searchParams.has(name)) {
      destination.searchParams.set(name, value);
    }
  }

  return redirect(
    `${destination.pathname}${destination.search}${destination.hash}`,
  );
}
