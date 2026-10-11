import { useEffect } from "react";

export function useAdminNotice(message: string | null) {
  useEffect(() => {
    if (!message || typeof shopify === "undefined") return;
    shopify.toast.show(message);
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [message]);
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <s-banner tone="critical" heading="Check this form">
      {message}
    </s-banner>
  );
}

export function MetricGrid({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <s-grid gridTemplateColumns="1fr 1fr 1fr 1fr" gap="base">
      {items.map((item) => (
        <s-box
          key={item.label}
          padding="base"
          background="subdued"
          borderWidth="base"
          borderRadius="base"
        >
          <s-heading>{item.value}</s-heading>
          <s-paragraph color="subdued">{item.label}</s-paragraph>
        </s-box>
      ))}
    </s-grid>
  );
}
