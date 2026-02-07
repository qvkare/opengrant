import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  bigint,
  numeric,
  integer,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================
// ENUMS
// ============================================

export const publisherStatusEnum = pgEnum("publisher_status", [
  "pending",
  "active",
  "suspended",
  "inactive",
]);

export const apiStatusEnum = pgEnum("api_status", [
  "draft",
  "active",
  "deprecated",
  "inactive",
]);

export const healthStatusEnum = pgEnum("health_status", [
  "healthy",
  "degraded",
  "down",
  "unknown",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "verified",
  "settled",
  "failed",
]);

export const withdrawalStatusEnum = pgEnum("withdrawal_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const httpMethodEnum = pgEnum("http_method", [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

// ============================================
// PUBLISHERS
// ============================================

export const publishers = pgTable(
  "publishers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAddress: varchar("wallet_address", { length: 42 }).notNull().unique(),

    // Profile
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    githubUsername: varchar("github_username", { length: 100 }),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    websiteUrl: text("website_url"),

    // On-chain references
    vaultAddress: varchar("vault_address", { length: 42 }),
    registryTxHash: varchar("registry_tx_hash", { length: 66 }),

    // Status
    status: publisherStatusEnum("status").default("pending").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    // Settings
    settings: jsonb("settings")
      .default({
        notifications: { email: true, webhook: false },
        payoutThreshold: "10000000", // 10 USDC
        autoWithdraw: false,
      })
      .notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // walletAddress already has a unique constraint which creates an index
    index("idx_publishers_status").on(table.status),
  ]
);

// ============================================
// APIs
// ============================================

export const apis = pgTable(
  "apis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),

    // Identification
    slug: varchar("slug", { length: 100 }).notNull(),
    onchainId: varchar("onchain_id", { length: 66 }).unique(),

    // Metadata
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    documentationUrl: text("documentation_url"),
    baseUrl: text("base_url").notNull(),
    logoUrl: text("logo_url"),

    // Categorization
    category: varchar("category", { length: 50 }),
    tags: text("tags").array(),

    // Status
    status: apiStatusEnum("status").default("draft").notNull(),
    healthStatus: healthStatusEnum("health_status").default("unknown").notNull(),
    lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),

    // Statistics (denormalized for performance)
    totalCalls: bigint("total_calls", { mode: "number" }).default(0).notNull(),
    totalRevenue: numeric("total_revenue", { precision: 20, scale: 6 }).default("0").notNull(),
    uniqueConsumers: integer("unique_consumers").default(0).notNull(),
    avgResponseTimeMs: integer("avg_response_time_ms"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_apis_publisher").on(table.publisherId),
    index("idx_apis_status").on(table.status),
    index("idx_apis_category").on(table.category),
    index("idx_apis_slug").on(table.slug),
    uniqueIndex("idx_apis_publisher_slug").on(table.publisherId, table.slug),
  ]
);

// ============================================
// ENDPOINTS
// ============================================

export const endpoints = pgTable(
  "endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id, { onDelete: "cascade" }),

    // Route definition
    path: varchar("path", { length: 500 }).notNull(),
    method: httpMethodEnum("method").notNull(),

    // Pricing (USDC with 6 decimals, stored as bigint)
    pricePerCall: bigint("price_per_call", { mode: "number" }).default(0).notNull(),

    // Rate limiting
    rateLimitPerMinute: integer("rate_limit_per_minute").default(60),
    rateLimitPerHour: integer("rate_limit_per_hour").default(1000),
    rateLimitPerDay: integer("rate_limit_per_day").default(10000),

    // Configuration
    description: text("description"),
    requestSchema: jsonb("request_schema"),
    responseSchema: jsonb("response_schema"),

    // Status
    isActive: boolean("is_active").default(true).notNull(),
    requiresAuth: boolean("requires_auth").default(true).notNull(),

    // Statistics
    totalCalls: bigint("total_calls", { mode: "number" }).default(0).notNull(),
    totalRevenue: numeric("total_revenue", { precision: 20, scale: 6 }).default("0").notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_endpoints_api").on(table.apiId),
    index("idx_endpoints_active").on(table.apiId, table.isActive),
    index("idx_endpoints_price").on(table.pricePerCall),
    uniqueIndex("idx_endpoints_api_path_method").on(table.apiId, table.path, table.method),
  ]
);

// ============================================
// CONSUMERS
// ============================================

export const consumers = pgTable(
  "consumers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAddress: varchar("wallet_address", { length: 42 }).notNull().unique(),

    // Optional profile
    name: varchar("name", { length: 255 }),
    email: varchar("email", { length: 255 }),

    // Embedded wallet (Privy)
    privyUserId: varchar("privy_user_id", { length: 100 }),
    embeddedWalletAddress: varchar("embedded_wallet_address", { length: 42 }),

    // Credit balance (pre-paid USDC balance in platform)
    creditBalance: numeric("credit_balance", { precision: 20, scale: 6 }).default("0").notNull(),

    // Settings
    settings: jsonb("settings")
      .default({
        autoFund: false,
        lowBalanceThreshold: "1000000", // 1 USDC
      })
      .notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_consumers_wallet").on(table.walletAddress),
    index("idx_consumers_privy").on(table.privyUserId),
  ]
);

// ============================================
// API KEYS
// ============================================

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consumerId: uuid("consumer_id")
      .notNull()
      .references(() => consumers.id, { onDelete: "cascade" }),

    // Key data
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
    keyPrefix: varchar("key_prefix", { length: 8 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),

    // Permissions
    allowedApis: uuid("allowed_apis").array(),
    allowedEndpoints: uuid("allowed_endpoints").array(),

    // Rate limiting (per key)
    rateLimitOverride: jsonb("rate_limit_override"),

    // Status
    isActive: boolean("is_active").default(true).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_api_keys_consumer").on(table.consumerId),
    index("idx_api_keys_hash").on(table.keyHash),
    index("idx_api_keys_prefix").on(table.keyPrefix),
  ]
);

// ============================================
// USAGE RECORDS
// ============================================

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // References
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => endpoints.id),
    consumerId: uuid("consumer_id")
      .notNull()
      .references(() => consumers.id),
    apiKeyId: uuid("api_key_id")
      .references(() => apiKeys.id, { onDelete: "set null" }),

    // Request details
    requestId: varchar("request_id", { length: 36 }).notNull(),
    requestTimestamp: timestamp("request_timestamp", { withTimezone: true }).notNull(),

    // Pricing at time of request
    priceCharged: bigint("price_charged", { mode: "number" }).notNull(),

    // x402 payment details
    paymentPayload: jsonb("payment_payload"),
    paymentTxHash: varchar("payment_tx_hash", { length: 66 }),
    paymentStatus: paymentStatusEnum("payment_status").default("pending").notNull(),

    // Performance
    responseTimeMs: integer("response_time_ms"),
    responseStatus: integer("response_status"),

    // Settlement tracking
    settlementBatchId: uuid("settlement_batch_id"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_usage_api_time").on(table.apiId, table.requestTimestamp),
    index("idx_usage_consumer").on(table.consumerId, table.requestTimestamp),
    index("idx_usage_settlement").on(table.paymentStatus, table.requestTimestamp),
    index("idx_usage_request_id").on(table.requestId),
    index("idx_usage_api_status").on(table.apiId, table.paymentStatus),
  ]
);

// ============================================
// PAYMENTS
// ============================================

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // References
    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => publishers.id),
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id),

    // Amount details
    grossAmount: numeric("gross_amount", { precision: 20, scale: 6 }).notNull(),
    platformFee: numeric("platform_fee", { precision: 20, scale: 6 }).notNull(),
    netAmount: numeric("net_amount", { precision: 20, scale: 6 }).notNull(),

    // Settlement
    settlementTxHash: varchar("settlement_tx_hash", { length: 66 }),
    settledAt: timestamp("settled_at", { withTimezone: true }),

    // Aggregation period
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    usageCount: integer("usage_count").notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_payments_publisher").on(table.publisherId),
    index("idx_payments_period").on(table.periodStart, table.periodEnd),
    index("idx_payments_api").on(table.apiId),
  ]
);

// ============================================
// WITHDRAWALS
// ============================================

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => publishers.id),

    // Amount
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),

    // Destination
    destinationAddress: varchar("destination_address", { length: 42 }).notNull(),
    destinationChain: varchar("destination_chain", { length: 20 }).notNull(),

    // Transaction
    txHash: varchar("tx_hash", { length: 66 }),
    status: withdrawalStatusEnum("status").default("pending").notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  }
);

// ============================================
// RELATIONS
// ============================================

export const publishersRelations = relations(publishers, ({ many }) => ({
  apis: many(apis),
  payments: many(payments),
  withdrawals: many(withdrawals),
}));

export const apisRelations = relations(apis, ({ one, many }) => ({
  publisher: one(publishers, {
    fields: [apis.publisherId],
    references: [publishers.id],
  }),
  endpoints: many(endpoints),
  payments: many(payments),
}));

export const endpointsRelations = relations(endpoints, ({ one }) => ({
  api: one(apis, {
    fields: [endpoints.apiId],
    references: [apis.id],
  }),
}));

export const consumersRelations = relations(consumers, ({ many }) => ({
  apiKeys: many(apiKeys),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  consumer: one(consumers, {
    fields: [apiKeys.consumerId],
    references: [consumers.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  publisher: one(publishers, {
    fields: [payments.publisherId],
    references: [publishers.id],
  }),
  api: one(apis, {
    fields: [payments.apiId],
    references: [apis.id],
  }),
}));

export const withdrawalsRelations = relations(withdrawals, ({ one }) => ({
  publisher: one(publishers, {
    fields: [withdrawals.publisherId],
    references: [publishers.id],
  }),
}));

// ============================================
// TYPES
// ============================================

export type Publisher = typeof publishers.$inferSelect;
export type NewPublisher = typeof publishers.$inferInsert;

export type Api = typeof apis.$inferSelect;
export type NewApi = typeof apis.$inferInsert;

export type Endpoint = typeof endpoints.$inferSelect;
export type NewEndpoint = typeof endpoints.$inferInsert;

export type Consumer = typeof consumers.$inferSelect;
export type NewConsumer = typeof consumers.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type Withdrawal = typeof withdrawals.$inferSelect;
export type NewWithdrawal = typeof withdrawals.$inferInsert;
