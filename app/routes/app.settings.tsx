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
import { updatePreferences } from "../services/settings.server";
import { useAdminNotice } from "../components/admin-ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const notice = new URL(request.url).searchParams.get("notice");
  return {
    settings: shop.settings,
    notice: notice === "saved" ? "Settings saved" : null,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  await updatePreferences(shop.id, await request.formData());
  return appRedirect(request, "/app/settings?notice=saved");
};

export default function SettingsPage() {
  const { settings, notice, aiConfigured } = useLoaderData<typeof loader>();
  useAdminNotice(notice);

  return (
    <s-page heading="Settings">
      <s-section heading="Customer data">
        <s-paragraph>
          Choose what the quiz asks before the first question. Name and age are
          stored for this shop and removed when the app is uninstalled.
        </s-paragraph>
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <OnOff
                label="Collect name"
                name="collectName"
                on={settings.collectName}
              />
              <OnOff
                label="Name required"
                name="nameRequired"
                on={settings.nameRequired}
              />
              <OnOff
                label="Collect age"
                name="collectAge"
                on={settings.collectAge}
              />
              <OnOff
                label="Age required"
                name="ageRequired"
                on={settings.ageRequired}
              />
            </s-grid>
            <s-heading>AI</s-heading>
            {aiConfigured ? (
              <s-banner tone="success" heading="AI key found">
                Ranking uses your mapped products only. The key stays on the
                server and is never sent to the storefront.
              </s-banner>
            ) : (
              <s-banner tone="info" heading="AI key not set">
                Add OPENAI_API_KEY to the app environment to enable ranking and
                explanations. Rule scores still work without it.
              </s-banner>
            )}
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <OnOff
                label="AI recommendations"
                name="aiEnabled"
                on={settings.aiEnabled}
              />
              <OnOff
                label="AI explanation"
                name="aiExplanation"
                on={settings.aiExplanation}
              />
              <s-select
                label="Recommendation style"
                name="recommendationStyle"
                value={settings.recommendationStyle}
              >
                <s-option value="best_match">Best match</s-option>
                <s-option value="diverse">Diverse set</s-option>
              </s-select>
              <s-number-field
                label="Maximum products"
                name="maxRecommendations"
                value={String(settings.maxRecommendations)}
                min={1}
                max={8}
              />
            </s-grid>
            <s-button type="submit" variant="primary">
              Save settings
            </s-button>
          </s-stack>
        </Form>
      </s-section>
      <s-section slot="aside" heading="Privacy">
        <s-paragraph>
          The storefront talks to QuizCart through the app proxy. Shopify access
          tokens and the AI key never ship in the theme block.
        </s-paragraph>
      </s-section>
      <s-section slot="aside" heading="Billing">
        <s-paragraph>
          Billing is not enabled. The app does not create charges.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

function OnOff({
  label,
  name,
  on,
}: {
  label: string;
  name: string;
  on: boolean;
}) {
  return (
    <s-select label={label} name={name} value={on ? "on" : "off"}>
      <s-option value="on">On</s-option>
      <s-option value="off">Off</s-option>
    </s-select>
  );
}

export const headers: HeadersFunction = boundaryHeaders;
