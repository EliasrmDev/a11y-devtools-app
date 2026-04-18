import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Cache of models fetched live from provider APIs.
 * Each row caches the full model list for one provider.
 * TTL-based expiry handled at the application layer.
 */
export const providerModelsCache = pgTable(
  "provider_models_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerType: varchar("provider_type", { length: 50 }).notNull(),
    /** The full JSON array of NormalizedModel[] */
    models: jsonb("models").notNull().$type<unknown[]>(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_models_cache_provider").on(table.providerType),
    index("idx_models_cache_fetched_at").on(table.fetchedAt),
  ],
);
