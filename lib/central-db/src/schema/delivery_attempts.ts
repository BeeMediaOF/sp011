import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

/** Histórico de tentativas de entrega (append-only). */
export const deliveryAttemptsTable = pgTable("delivery_attempts", {
  id:           serial("id").primaryKey(),
  deliveryId:   text("delivery_id").notNull(),
  attemptNo:    integer("attempt_no").notNull(),
  httpStatus:   integer("http_status"),
  ok:           boolean("ok").notNull().default(false),
  errorMessage: text("error_message"),
  durationMs:   integer("duration_ms"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("delivery_attempts_delivery_idx").on(t.deliveryId),
]);

export type DeliveryAttemptRow    = typeof deliveryAttemptsTable.$inferSelect;
export type DeliveryAttemptInsert = typeof deliveryAttemptsTable.$inferInsert;
