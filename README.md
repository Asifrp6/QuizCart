# QuizCart

QuizCart helps Shopify merchants build product quizzes. Shoppers answer a few questions on the storefront and get recommendations from the merchant's real catalog.

The admin app is the official Shopify React Router template with Prisma. Authentication, session storage, and webhooks stay inside this app. The storefront quiz is a theme app extension and calls the app through Shopify's app proxy, so access tokens and AI keys never reach the browser.

## Local development

```shell
shopify app dev
```

Open the app from the CLI, install it on a development store, then:

1. Sync products.
2. Create a quiz, add questions, map answers to products, and publish it.
3. In the theme editor, add the QuizCart block and paste the quiz handle.

The app uses `read_products` for catalog syncing and `read_files` for the quiz image library. Reinstall the app if Shopify asks you to approve updated scopes.

Dashboard **Create New Quiz** opens the creation form directly. Enter a title to open the question editor, add questions and answers, then connect products. Use **Any answer** for default recommendations, including quizzes with text or slider questions. Choice questions need at least two answers, and quizzes need a product mapping before publishing. Welcome screens, customer fields, and results can be customized from the editor.

## Verification

Use **Duplicate** in the quiz list to copy questions, answers, branching rules, product mappings, and appearance into a new draft. Shopper sessions and analytics stay with the original quiz. In the question editor, drag the handles (or focus a handle and use the arrow keys) to change numbered question order. Click a question or its edit icon to open the editor popup, use Add question to create one, and use the delete icon for confirmation; questions must stay after the answers their branching rules depend on. The editor shows a checklist of missing questions, answer choices, and product mappings before publishing.

The Quizzes page displays searchable cards with status filters. Each card has labeled icon buttons for editing, duplicating, publishing or moving to draft, and deleting. These open popups with edit shortcuts or action confirmation. The create popup also opens from dashboard creation links. Validation errors stay inside the popup, and Escape or the close button dismisses it when no action is running.

```shell
npm test
npm run typecheck
npm run lint
npm run build
```

The regression tests isolate service dependencies and do not modify the development database. They cover branching, scoring, validation, mapping updates, and repeat/concurrent completion. Test embedded navigation, Shopify Files, product sync, and cart behavior in an authenticated development store before deployment.

## AI ranking

Rule scores choose candidate products. If `OPENAI_API_KEY` is set and AI is enabled in Settings, those candidates are reordered and can include a short explanation. Without the key, the highest scores are returned as-is.

## Data

Local development uses SQLite (`prisma/dev.sqlite`). The Prisma models are ready to move to PostgreSQL by changing the datasource when you deploy.
