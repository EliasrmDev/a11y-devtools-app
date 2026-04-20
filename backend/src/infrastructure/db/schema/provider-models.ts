import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const providerModels = pgTable(
  "provider_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerType: varchar("provider_type", { length: 50 }).notNull(),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    maxTokens: integer("max_tokens"),
    supportsStreaming: boolean("supports_streaming").notNull().default(true),
    supportsVision: boolean("supports_vision").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_models_provider_model").on(
      table.providerType,
      table.modelId,
    ),
    index("idx_models_provider_type").on(table.providerType),
  ],
);
