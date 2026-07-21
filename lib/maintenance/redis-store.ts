import Redis from "ioredis";
import type { MaintenanceKeyValueStore } from "@/lib/maintenance/types";

function isTruthy(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function createClient(): Redis {
  const client = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number.parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB || "0", 10),
    tls: isTruthy(process.env.REDIS_TLS) ? {} : undefined,
    lazyConnect: true,
    connectTimeout: 250,
    commandTimeout: 250,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });

  // The service emits a rate-limited warning. This listener only prevents
  // ioredis from treating an expected connection failure as unhandled.
  client.on("error", () => undefined);
  return client;
}

export function createMaintenanceRedisStore(): MaintenanceKeyValueStore {
  let client = createClient();

  async function connectedClient(): Promise<Redis> {
    if (client.status === "end") {
      client = createClient();
    }
    if (client.status === "wait") {
      await client.connect();
    }
    return client;
  }

  return {
    async get(key) {
      return (await connectedClient()).get(key);
    },
    async set(key, value) {
      await (await connectedClient()).set(key, value);
    },
    async close() {
      client.disconnect(false);
    },
  };
}
