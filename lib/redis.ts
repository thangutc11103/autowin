import Redis from "ioredis";

let redis: Redis | null = null;

function isTruthy(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || "0"),
      tls: isTruthy(process.env.REDIS_TLS) ? {} : undefined,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redis.on("error", (err) => {
      console.error("Redis connection error:", err);
    });

    redis.on("connect", () => {
      console.log("Redis connected");
    });
  }

  return redis;
}

export async function checkRedisConnection(): Promise<{
  ok: boolean;
  host: string;
  port: number;
  tls: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const startedAt = Date.now();
  const host = process.env.REDIS_HOST || "localhost";
  const port = parseInt(process.env.REDIS_PORT || "6379");
  const tls = isTruthy(process.env.REDIS_TLS);

  try {
    const pong = await getRedis().ping();
    return {
      ok: pong === "PONG",
      host,
      port,
      tls,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      host,
      port,
      tls,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
