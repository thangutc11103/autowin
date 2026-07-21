export const MAINTENANCE_REDIS_KEY = "find-app:maintenance:state:v1";
export const MAINTENANCE_CACHE_TTL_MS = 2_000;
export const MAINTENANCE_TITLE_MAX_LENGTH = 120;
export const MAINTENANCE_MESSAGE_MAX_LENGTH = 1_000;

export interface MaintenanceState {
  version: 1;
  enabled: boolean;
  title: string;
  message: string;
  estimatedEndAt: string | null;
  updatedAt: string;
  updatedBy: string;
}

export type MaintenanceSource =
  | "default"
  | "redis"
  | "last-known"
  | "environment";

export interface MaintenanceSnapshot {
  state: MaintenanceState;
  source: MaintenanceSource;
  environmentForced: boolean;
  stale: boolean;
}

export interface MaintenanceUpdate {
  enabled: boolean;
  title?: string;
  message?: string;
  estimatedEndAt?: string | null;
  updatedBy: string;
}

export interface MaintenanceKeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  close(): Promise<void>;
}

export interface MaintenanceServiceContract {
  getRedisState(options?: { fresh?: boolean }): Promise<MaintenanceSnapshot>;
  getEffectiveState(options?: { fresh?: boolean }): Promise<MaintenanceSnapshot>;
  updateState(input: MaintenanceUpdate): Promise<MaintenanceSnapshot>;
  invalidateCache(): void;
  close(): Promise<void>;
}

export type MaintenanceEnvironment = Record<string, string | undefined>;
