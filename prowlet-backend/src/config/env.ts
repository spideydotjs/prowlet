import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  FRONTEND_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(32).default("development-secret-change-before-production"),
  DATABASE_URL: z.string().url().default("postgresql://postgres:postgres@127.0.0.1:5435/prowlet"),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  SOLANA_CLUSTER: z.enum(["devnet", "testnet", "mainnet-beta", "localnet"]).default("devnet"),
  SOLANA_RPC_URL: z.string().url().default("https://api.devnet.solana.com"),
  SOLANA_KEYPAIR_PATH: z.string().optional(),
  BLOCKCHAIN_MODE: z.enum(["mock", "solana"]).default("mock"),
  PROGRAM_ID: z.string().default("Hi76RFfVSD82bW3KLhUYWw5rLRf4xVLrS5JzdYEgKdcB"),
  UPLOAD_DIR: z.string().default("./storage"),
  MAX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(1000),
  ADMIN_EMAIL: z.string().email().default("admin@prowlet.local"),
  ADMIN_PASSWORD: z.string().min(8).default("change-this-before-use"),
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && value.JWT_SECRET === "development-secret-change-before-production") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_SECRET"], message: "JWT_SECRET must be set in production." });
  }
});

export const env = envSchema.parse(process.env);
