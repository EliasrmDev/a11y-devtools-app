import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const revokedTokens = pgTable(
  "revoked_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenJti: varchar("token_jti", { length: 64 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 50 }).notNull().default("logout"),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_revoked_token_jti").on(table.tokenJti),
    index("idx_revoked_expires_at").on(table.expiresAt),
  ],
);
