import {
  pgTable,
  uuid,
  varchar,
  smallint,
  timestamp,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { aiProviderConnections } from "./ai-provider-connections";

const bytea = customType<{ data: Buffer; dpiverData: string }>({
  dataType() {
    return "bytea";
  },
});

export const encryptedSecrets = pgTable(
  "encrypted_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => aiProviderConnections.id, { onDelete: "cascade" }),
    secretType: varchar("secret_type", { length: 50 })
      .notNull()
      .default("api_key"),
    encryptedDek: bytea("encrypted_dek").notNull(),
    dekIv: bytea("dek_iv").notNull(),
    ciphertext: bytea("ciphertext").notNull(),
    cipherIv: bytea("cipher_iv").notNull(),
    authTag: bytea("auth_tag").notNull(),
    kekVersion: smallint("kek_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_secrets_connection_type").on(
      table.connectionId,
      table.secretType,
    ),
  ],
);
