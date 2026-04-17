import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const aiProviderConnections = pgTable(
  "ai_provider_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerType: varchar("provider_type", { length: 50 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    baseUrl: text("base_url"),
    customHeadersEnc: text("custom_headers_enc"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_connections_user_id").on(table.userId),
    index("idx_connections_user_provider").on(table.userId, table.providerType),
  ],
);
