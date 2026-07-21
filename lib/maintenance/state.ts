import {
  MAINTENANCE_MESSAGE_MAX_LENGTH,
  MAINTENANCE_TITLE_MAX_LENGTH,
  type MaintenanceEnvironment,
  type MaintenanceState,
} from "@/lib/maintenance/types";

const DEFAULT_TITLE = "Hệ thống đang được bảo trì";
const DEFAULT_MESSAGE =
  "Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau.";

export class MaintenanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaintenanceValidationError";
  }
}

export class MaintenanceEnvironmentOverrideError extends Error {
  constructor() {
    super(
      "Maintenance mode is forced by MAINTENANCE_MODE and cannot be disabled here.",
    );
    this.name = "MaintenanceEnvironmentOverrideError";
  }
}

export function createDefaultMaintenanceState(): MaintenanceState {
  return {
    version: 1,
    enabled: false,
    title: DEFAULT_TITLE,
    message: DEFAULT_MESSAGE,
    estimatedEndAt: null,
    updatedAt: new Date(0).toISOString(),
    updatedBy: "system",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeRequiredText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new MaintenanceValidationError(`${label} must be a string.`);
  }

  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    throw new MaintenanceValidationError(`${label} cannot be empty.`);
  }
  if (normalized.length > maxLength) {
    throw new MaintenanceValidationError(
      `${label} cannot exceed ${maxLength} characters.`,
    );
  }
  return normalized;
}

function normalizeIsoTimestamp(
  value: unknown,
  label: string,
  allowNull: boolean,
): string | null {
  if (allowNull && value === null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new MaintenanceValidationError(
      `${label} must be a valid ISO 8601 timestamp.`,
    );
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new MaintenanceValidationError(
      `${label} must be a valid ISO 8601 timestamp.`,
    );
  }
  return timestamp.toISOString();
}

export function normalizeMaintenanceUpdate(
  input: unknown,
  options: {
    baseState?: MaintenanceState;
    now?: () => Date;
  } = {},
): MaintenanceState {
  if (!isRecord(input)) {
    throw new MaintenanceValidationError("Maintenance update must be an object.");
  }
  if (typeof input.enabled !== "boolean") {
    throw new MaintenanceValidationError("enabled must be a boolean.");
  }

  const baseState = options.baseState ?? createDefaultMaintenanceState();
  const title =
    input.title === undefined
      ? baseState.title
      : normalizeRequiredText(
          input.title,
          "title",
          MAINTENANCE_TITLE_MAX_LENGTH,
        );
  const message =
    input.message === undefined
      ? baseState.message
      : normalizeRequiredText(
          input.message,
          "message",
          MAINTENANCE_MESSAGE_MAX_LENGTH,
        );
  const estimatedEndAt =
    input.estimatedEndAt === undefined
      ? baseState.estimatedEndAt
      : normalizeIsoTimestamp(input.estimatedEndAt, "estimatedEndAt", true);
  const updatedBy = normalizeRequiredText(input.updatedBy, "updatedBy", 255);

  return {
    version: 1,
    enabled: input.enabled,
    title,
    message,
    estimatedEndAt,
    updatedAt: (options.now ?? (() => new Date()))().toISOString(),
    updatedBy,
  };
}

export function parseStoredMaintenanceState(raw: string): MaintenanceState {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new MaintenanceValidationError("Stored maintenance state is not JSON.");
  }

  if (!isRecord(input) || input.version !== 1) {
    throw new MaintenanceValidationError(
      "Stored maintenance state has an unsupported version.",
    );
  }
  if (typeof input.enabled !== "boolean") {
    throw new MaintenanceValidationError("Stored enabled value is invalid.");
  }

  return {
    version: 1,
    enabled: input.enabled,
    title: normalizeRequiredText(
      input.title,
      "title",
      MAINTENANCE_TITLE_MAX_LENGTH,
    ),
    message: normalizeRequiredText(
      input.message,
      "message",
      MAINTENANCE_MESSAGE_MAX_LENGTH,
    ),
    estimatedEndAt:
      input.estimatedEndAt === null
        ? null
        : normalizeIsoTimestamp(input.estimatedEndAt, "estimatedEndAt", false),
    updatedAt: normalizeIsoTimestamp(input.updatedAt, "updatedAt", false) as string,
    updatedBy: normalizeRequiredText(input.updatedBy, "updatedBy", 255),
  };
}

export function isMaintenanceEnvironmentForced(
  environment: MaintenanceEnvironment,
): boolean {
  const value = environment.MAINTENANCE_MODE?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

function safeEnvironmentText(
  value: string | undefined,
  fallback: string,
  maxLength: number,
): string {
  if (value === undefined) return fallback;
  try {
    return normalizeRequiredText(value, "environment value", maxLength);
  } catch {
    return fallback;
  }
}

function safeEnvironmentTimestamp(
  value: string | undefined,
  fallback: string | null,
): string | null {
  if (value === undefined) return fallback;
  try {
    return normalizeIsoTimestamp(value, "MAINTENANCE_UNTIL", false);
  } catch {
    return null;
  }
}

export function resolveEnvironmentMaintenanceState(
  baseState: MaintenanceState,
  environment: MaintenanceEnvironment,
): MaintenanceState {
  if (!isMaintenanceEnvironmentForced(environment)) {
    return baseState;
  }

  return {
    ...baseState,
    enabled: true,
    title: safeEnvironmentText(
      environment.MAINTENANCE_TITLE,
      baseState.title,
      MAINTENANCE_TITLE_MAX_LENGTH,
    ),
    message: safeEnvironmentText(
      environment.MAINTENANCE_MESSAGE,
      baseState.message,
      MAINTENANCE_MESSAGE_MAX_LENGTH,
    ),
    estimatedEndAt: safeEnvironmentTimestamp(
      environment.MAINTENANCE_UNTIL,
      baseState.estimatedEndAt,
    ),
    updatedBy: "environment",
  };
}
