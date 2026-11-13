import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const accounts = sqliteTable('accounts', {
  wallet: text('wallet').primaryKey(), name: text('name').notNull(), region: text('region').notNull().default(''), bio: text('bio').notNull().default(''),
  supplier: integer('supplier').notNull().default(0), createdAt: integer('created_at').notNull(),
});
export const challenges = sqliteTable('challenges', {
  id: text('id').primaryKey(), wallet: text('wallet').notNull(), message: text('message').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
  hash: text('hash').primaryKey(), wallet: text('wallet').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const pools = sqliteTable('pools', {
  id: text('id').primaryKey(), wallet: text('wallet').notNull(), title: text('title').notNull(), description: text('description').notNull(),
  category: text('category').notNull(), region: text('region').notNull(), target: integer('target').notNull(), minimum: integer('minimum').notNull(),
  price: text('price').notNull(), closesAt: integer('closes_at').notNull(), createdAt: integer('created_at').notNull(), status: text('status').notNull().default('OPEN'),
  onchainId: text('onchain_id'), txHash: text('tx_hash'),
});
export const interests = sqliteTable('interests', {
  id: text('id').primaryKey(), poolId: text('pool_id').notNull(), wallet: text('wallet').notNull(), quantity: integer('quantity').notNull(), createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('interest_pool_wallet').on(table.poolId, table.wallet)]);
export const offers = sqliteTable('offers', {
  id: text('id').primaryKey(), poolId: text('pool_id').notNull(), wallet: text('wallet').notNull(), price: text('price').notNull(),
  capacity: integer('capacity').notNull(), note: text('note').notNull(), createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('offer_pool_wallet').on(table.poolId, table.wallet)]);
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(), poolId: text('pool_id').notNull(), wallet: text('wallet').notNull(), body: text('body').notNull(), createdAt: integer('created_at').notNull(),
});
export const events = sqliteTable('events', {
  id: text('id').primaryKey(), poolId: text('pool_id'), wallet: text('wallet').notNull(), kind: text('kind').notNull(), detail: text('detail').notNull(), createdAt: integer('created_at').notNull(),
});
export const evidence = sqliteTable('evidence', {
  id:text('id').primaryKey(), contract:text('contract').notNull(), poolId:integer('pool_id').notNull(),
  buyer:text('buyer').notNull(), uploader:text('uploader').notNull(), kind:text('kind').notNull(),
  reference:text('reference').notNull(), evidenceHash:text('evidence_hash').notNull(), txHash:text('tx_hash').notNull(),
  createdAt:integer('created_at').notNull(),
},table=>[uniqueIndex('evidence_transaction_hash').on(table.txHash,table.evidenceHash)]);
