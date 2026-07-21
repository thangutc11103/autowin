import type { CurrentUser } from "@/lib/auth/session-auth";
import {
  MaintenanceEnvironmentOverrideError,
  MaintenanceValidationError,
} from "@/lib/maintenance/state";
import type {
  MaintenanceServiceContract,
  MaintenanceUpdate,
} from "@/lib/maintenance/types";

interface AdminApiLogger {
  error(message: string): void;
}

interface MaintenanceAdminApiDependencies {
  requireAdmin(request: Request): Promise<Response | null>;
  getCurrentUser(request: Request): Promise<CurrentUser | null>;
  getRequestUserId(request: Request): string | null;
  service: MaintenanceServiceContract;
  logger?: AdminApiLogger;
}

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapServiceError(
  error: unknown,
  logger: AdminApiLogger,
  operation: "GET" | "PUT",
): Response {
  if (error instanceof MaintenanceValidationError) {
    return noStoreJson({ error: error.message }, 400);
  }
  if (error instanceof MaintenanceEnvironmentOverrideError) {
    return noStoreJson({ error: error.message }, 409);
  }

  logger.error(`[maintenance] Admin API ${operation} failed.`);
  return noStoreJson({ error: "Maintenance service unavailable" }, 503);
}

export function createMaintenanceAdminApi(
  dependencies: MaintenanceAdminApiDependencies,
): {
  get(request: Request): Promise<Response>;
  put(request: Request): Promise<Response>;
} {
  const logger = dependencies.logger ?? console;

  return {
    async get(request) {
      try {
        const denied = await dependencies.requireAdmin(request);
        if (denied) return denied;
        const snapshot = await dependencies.service.getEffectiveState({ fresh: true });
        return noStoreJson(snapshot);
      } catch (error) {
        return mapServiceError(error, logger, "GET");
      }
    },

    async put(request) {
      try {
        const denied = await dependencies.requireAdmin(request);
        if (denied) return denied;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return noStoreJson({ error: "Invalid JSON body" }, 400);
        }

        const input = isRecord(body) ? body : {};
        let updatedBy = dependencies.getRequestUserId(request);
        if (!updatedBy) {
          const user = await dependencies.getCurrentUser(request);
          updatedBy = user?.id ?? "admin-api";
        }

        const update: MaintenanceUpdate = {
          enabled: input.enabled as boolean,
          updatedBy,
        };
        if (Object.hasOwn(input, "title")) {
          update.title = input.title as string;
        }
        if (Object.hasOwn(input, "message")) {
          update.message = input.message as string;
        }
        if (Object.hasOwn(input, "estimatedEndAt")) {
          update.estimatedEndAt = input.estimatedEndAt as string | null;
        }

        const snapshot = await dependencies.service.updateState(update);
        return noStoreJson(snapshot);
      } catch (error) {
        return mapServiceError(error, logger, "PUT");
      }
    },
  };
}
