import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  created: integer('created').notNull(),
  bio: text('bio'),
  avatarId: text('avatar_id'),
  accent: text('accent').notNull().default('#8b7cff'),
  background: text('background').notNull().default('aurora'),
  density: text('density').notNull().default('comfortable'),
});

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    a: text('a').notNull().references(() => profiles.id),
    b: text('b').notNull().references(() => profiles.id),
    updated: integer('updated').notNull(),
  },
  (table) => [
    uniqueIndex('conversation_pair').on(table.a, table.b),
    index('conversation_b').on(table.b),
  ],
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversation: text('conversation').notNull().references(() => conversations.id),
    sender: text('sender').notNull().references(() => profiles.id),
    body: text('body').notNull(),
    created: integer('created').notNull(),
    fileId: text('file_id'),
    filename: text('filename'),
    mime: text('mime'),
    readAt: integer('read_at'),
  },
  (table) => [
    index('message_conversation_time').on(table.conversation, table.created),
    index('message_file').on(table.fileId),
  ],
);

export const hiddenConversations = sqliteTable(
  'hidden_conversations',
  {
    userId: text('user_id').notNull().references(() => profiles.id),
    conversation: text('conversation').notNull().references(() => conversations.id),
    hiddenAt: integer('hidden_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.conversation] }),
    index('hidden_conversation').on(table.conversation),
  ],
);

export const uploads = sqliteTable(
  'uploads',
  {
    id: text('id').primaryKey(),
    conversation: text('conversation').notNull().references(() => conversations.id),
    sender: text('sender').notNull().references(() => profiles.id),
    objectKey: text('object_key').notNull(),
    uploadId: text('upload_id').notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    body: text('body').notNull().default(''),
    created: integer('created').notNull(),
    status: text('status').notNull().default('uploading'),
  },
  (table) => [index('upload_sender_status').on(table.sender, table.status)],
);
