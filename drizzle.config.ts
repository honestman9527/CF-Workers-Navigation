import type { Config } from 'drizzle-kit';

export default {
  schema: './src/worker/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? 'local',
    databaseId: process.env.D1_DATABASE_ID ?? '00000000-0000-0000-0000-000000000000',
    token: process.env.CLOUDFLARE_API_TOKEN ?? 'local',
  },
} satisfies Config;
