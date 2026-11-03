import { createApp } from "./app";
import { env } from "./config/env";
import { pool } from "./db/pool";

const server = createApp().listen(env.PORT, () => {
  console.log(`Prowlet API listening on port ${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
