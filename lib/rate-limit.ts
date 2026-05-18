import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of rateLimitStore) {
      if (entry.resetTime < now) {
        expired.push(key);
      }
    }

    expired.forEach((key) => rateLimitStore.delete(key));
  },
  5 * 60 * 1000,
);

/**
 * Simple in-memory rate limiter for API endpoints
 * Default: 60 requests per minute per IP
 */
export function createRateLimiter(requestsPerMinute: number = 60) {
  return async (request: NextRequest) => {
    // Get client IP
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const key = `${ip}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    // Initialize or reset if expired
    if (!entry || entry.resetTime < now) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + 60 * 1000, // 1 minute window
      });
      return null; // Allow request
    }

    // Check limit
    if (entry.count >= requestsPerMinute) {
      return NextResponse.json(
        {
          error: "Too many requests. Please try again in a moment.",
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((entry.resetTime - now) / 1000)),
          },
        },
      );
    }

    // Increment counter
    entry.count++;
    return null; // Allow request
  };
}
