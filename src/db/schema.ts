import { relations, sql, type SQL } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  ACTIVITY_TYPES,
  JOB_SOURCES,
  JOB_STATUSES,
  LOST_REASONS,
  type ActivityMeta,
} from "../lib/domain";

// Relative import above on purpose: drizzle-kit loads this file outside Next.js
// and does not resolve the "@/" path alias.

/** SQL `IN (...)` list for a check constraint, built from a fixed enum. */
function oneOf(values: readonly string[]): SQL {
  return sql.raw(values.map((v) => `'${v}'`).join(", "));
}

/** Timestamps are stored as epoch milliseconds and surface as `Date`. */
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

const createdAt = () =>
  timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date());

const updatedAt = () =>
  timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

export const technicians = sqliteTable("technicians", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Contact person, e.g. "Rosa Martinez". */
    name: text("name"),
    /** e.g. "Rosa's Taqueria". At least one of name / businessName is required by the app. */
    businessName: text("business_name"),
    /** As typed, for display. */
    phone: text("phone"),
    /** Digits only, used to recognise repeat customers. */
    phoneDigits: text("phone_digits"),
    email: text("email"),
    /** Service location. */
    address: text("address"),
    /** Standing notes, e.g. "Gate code 4411, ask for the kitchen manager". */
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("customers_phone_digits_idx").on(t.phoneDigits)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** What's wrong, in the customer's words. */
    description: text("description").notNull(),
    /** Optional, e.g. "Walk-in cooler", "Ice machine". */
    equipment: text("equipment"),
    source: text("source", { enum: JOB_SOURCES }).notNull(),
    referredBy: text("referred_by"),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("new"),
    isEmergency: integer("is_emergency", { mode: "boolean" }).notNull().default(false),
    quoteAmountCents: integer("quote_amount_cents"),
    quoteSentAt: timestamp("quote_sent_at"),
    technicianId: integer("technician_id").references(() => technicians.id, {
      onDelete: "set null",
    }),
    /** Local date (YYYY-MM-DD) of the scheduled visit. */
    scheduledFor: text("scheduled_for"),
    /** Local date (YYYY-MM-DD) Denise promised to call back. Overrides the automatic rules. */
    followUpOn: text("follow_up_on"),
    /** Last time the customer heard from us. Null until the first contact. */
    lastContactAt: timestamp("last_contact_at"),
    /** When the request came in. Editable so notebook jobs keep their real dates. */
    receivedAt: timestamp("received_at")
      .notNull()
      .$defaultFn(() => new Date()),
    closedAt: timestamp("closed_at"),
    lostReason: text("lost_reason", { enum: LOST_REASONS }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_status_idx").on(t.status),
    index("jobs_customer_id_idx").on(t.customerId),
    check("jobs_status_check", sql`${t.status} IN (${oneOf(JOB_STATUSES)})`),
    check("jobs_source_check", sql`${t.source} IN (${oneOf(JOB_SOURCES)})`),
    check(
      "jobs_lost_reason_check",
      sql`${t.lostReason} IS NULL OR ${t.lostReason} IN (${oneOf(LOST_REASONS)})`,
    ),
  ],
);

export const activities = sqliteTable(
  "activities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    type: text("type", { enum: ACTIVITY_TYPES }).notNull(),
    /** Free text Denise typed, if any. */
    note: text("note"),
    /** Structured details for rendering, e.g. status change from/to. */
    meta: text("meta", { mode: "json" }).$type<ActivityMeta>(),
    /** When it happened. */
    createdAt: createdAt(),
  },
  (t) => [
    index("activities_job_id_created_at_idx").on(t.jobId, t.createdAt),
    check("activities_type_check", sql`${t.type} IN (${oneOf(ACTIVITY_TYPES)})`),
  ],
);

export const techniciansRelations = relations(technicians, ({ many }) => ({
  jobs: many(jobs),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  customer: one(customers, { fields: [jobs.customerId], references: [customers.id] }),
  technician: one(technicians, { fields: [jobs.technicianId], references: [technicians.id] }),
  activities: many(activities),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  job: one(jobs, { fields: [activities.jobId], references: [jobs.id] }),
}));

export type Technician = typeof technicians.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
