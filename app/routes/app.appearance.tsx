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
import { updateAppearance } from "../services/settings.server";
import { useAdminNotice } from "../components/admin-ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const notice = new URL(request.url).searchParams.get("notice");
  return {
    settings: shop.settings,
    notice: notice === "saved" ? "Appearance saved" : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  await updateAppearance(shop.id, await request.formData());
  return appRedirect(request, "/app/appearance?notice=saved");
};

export default function AppearancePage() {
  const { settings, notice } = useLoaderData<typeof loader>();
  useAdminNotice(notice);

  return (
    <s-page heading="Appearance">
      <s-section heading="Storefront theme">
        <s-paragraph>
          These colors and type settings apply to every quiz unless a quiz sets
          its own primary and accent colors.
        </s-paragraph>
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-color-field
                label="Primary"
                name="primaryColor"
                value={settings.primaryColor}
              />
              <s-color-field
                label="Accent"
                name="accentColor"
                value={settings.accentColor}
              />
              <s-color-field
                label="Background"
                name="backgroundColor"
                value={settings.backgroundColor}
              />
              <s-color-field
                label="Text"
                name="textColor"
                value={settings.textColor}
              />
            </s-grid>
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-text-field
                label="Font family"
                name="fontFamily"
                value={settings.fontFamily}
                details="Use inherit to follow the theme font."
              />
              <s-number-field
                label="Button radius"
                name="buttonRadius"
                value={String(settings.buttonRadius)}
                min={0}
                max={32}
              />
            </s-grid>
            <s-select
              label="Progress bar"
              name="showProgress"
              value={settings.showProgress ? "on" : "off"}
            >
              <s-option value="on">Show</s-option>
              <s-option value="off">Hide</s-option>
            </s-select>
            <s-button type="submit" variant="primary">
              Save appearance
            </s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = boundaryHeaders;
