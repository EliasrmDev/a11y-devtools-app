# Adding a New AI Provider

This document walks through adding support for a new AI provider (e.g. a new inference API) to both the proxy and the model-listing system.

---

## 1. Add the provider type

In `src/shared/types.ts`, add the new value to the `ProviderType` union:

```ts
export type ProviderType = "openai" | "anthropic" | "gemini" | "groq" | "openrouter" | "your-provider";
```

---

## 2. Implement the AI client (proxy)

Create `src/infrastructure/ai-providers/your-provider.client.ts` implementing `AiProviderPort` (`src/domain/ports/ai-provider.port.ts`). Required methods:

- `chat(request, connection, onChunk?)` — sends a chat completion request; calls `onChunk` for streaming
- `testConnection(connection)` — lightweight liveness check (e.g. list models or HEAD request)

Register it in `src/infrastructure/ai-providers/client.factory.ts`:

```ts
case "your-provider":
  return new YourProviderClient();
```

---

## 3. Implement the model-listing client (optional)

If the provider exposes a models API, create `src/infrastructure/ai-providers/models/your-provider.models.ts` implementing `ProviderModelsClient` (`src/domain/ports/provider-models.port.ts`). Required method:

- `fetchModels(apiKey, baseUrl?)` — returns `NormalizedModel[]`

Register it in `src/infrastructure/ai-providers/models/registry.ts`:

```ts
const clients = new Map<ProviderType, ProviderModelsClient>([
  // existing entries...
  ["your-provider", new YourProviderModelsClient()],
]);
```

If the provider has no models API, skip this step — users can still configure connections and the proxy will work, but `GET /providers/connections/:id/models` will return an empty list.

---

## 4. Update SSRF guard (if needed)

`src/infrastructure/ai-providers/ssrf-guard.ts` blocks non-standard ports and private IPs. If the provider uses a non-standard HTTPS port other than 443/8443, add it to the allowed list there.

---

## 5. Add to the DB enum (if applicable)

`provider_type` is stored as `varchar` in `ai_provider_connections` — no enum migration needed. However, if you add any provider-specific schema columns, generate and apply a migration:

```bash
npm run db:generate
npm run db:migrate
```

---

## 6. Checklist

- [ ] `ProviderType` union updated in `shared/types.ts`
- [ ] AI client implemented and registered in `client.factory.ts`
- [ ] Model-listing client implemented and registered in `models/registry.ts` (if API exists)
- [ ] SSRF guard updated if non-standard port required
- [ ] `npm run check` passes (typecheck + lint + tests)
