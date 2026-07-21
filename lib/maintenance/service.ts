import { createMaintenanceRedisStore } from "@/lib/maintenance/redis-store";
import {
  createDefaultMaintenanceState,
  isMaintenanceEnvironmentForced,
  MaintenanceEnvironmentOverrideError,
  normalizeMaintenanceUpdate,
  parseStoredMaintenanceState,
  resolveEnvironmentMaintenanceState,
} from "@/lib/maintenance/state";
import {
  MAINTENANCE_CACHE_TTL_MS,
  MAINTENANCE_REDIS_KEY,
  type MaintenanceEnvironment,
  type MaintenanceKeyValueStore,
  type MaintenanceServiceContract,
  type MaintenanceSnapshot,
  type MaintenanceState,
  type MaintenanceUpdate,
} from "@/lib/maintenance/types";

interface MaintenanceLogger {
  warn(message: string): void;
}

interface MaintenanceServiceOptions {
  store: MaintenanceKeyValueStore;
  environment?: MaintenanceEnvironment;
  now?: () => Date;
  cacheTtlMs?: number;
  warningIntervalMs?: number;
  logger?: MaintenanceLogger;
}

interface CachedSnapshot {
  snapshot: MaintenanceSnapshot;
  expiresAt: number;
}

export class MaintenanceService implements MaintenanceServiceContract {
  private readonly store: MaintenanceKeyValueStore;
  private readonly environment: MaintenanceEnvironment;
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private readonly warningIntervalMs: number;
  private readonly logger: MaintenanceLogger;
  private cache: CachedSnapshot | null = null;
  private lastKnownState: MaintenanceState | null = null;
  private lastWarningAt = Number.NEGATIVE_INFINITY;

  constructor(options: MaintenanceServiceOptions) {
    this.store = options.store;
    this.environment = options.environment ?? process.env;
    this.now = options.now ?? (() => new Date());
    this.cacheTtlMs = options.cacheTtlMs ?? MAINTENANCE_CACHE_TTL_MS;
    this.warningIntervalMs = options.warningIntervalMs ?? 30_000;
    this.logger = options.logger ?? console;
  }

  private setCache(snapshot: MaintenanceSnapshot): MaintenanceSnapshot {
    this.cache = {
      snapshot,
      expiresAt: this.now().getTime() + this.cacheTtlMs,
    };
    return snapshot;
  }

  private warnRedisFailure(error: unknown): void {
    const now = this.now().getTime();
    if (now - this.lastWarningAt < this.warningIntervalMs) return;
    this.lastWarningAt = now;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`[maintenance] Redis read failed: ${message}`);
  }

  async getRedisState(
    options: { fresh?: boolean } = {},
  ): Promise<MaintenanceSnapshot> {
    const now = this.now().getTime();
    if (!options.fresh && this.cache && this.cache.expiresAt > now) {
      return this.cache.snapshot;
    }

    try {
      const raw = await this.store.get(MAINTENANCE_REDIS_KEY);
      if (!raw) {
        return this.setCache({
          state: createDefaultMaintenanceState(),
          source: "default",
          environmentForced: false,
          stale: false,
        });
      }

      const state = parseStoredMaintenanceState(raw);
      this.lastKnownState = state;
      return this.setCache({
        state,
        source: "redis",
        environmentForced: false,
        stale: false,
      });
    } catch (error) {
      this.warnRedisFailure(error);
      return this.setCache({
        state: this.lastKnownState ?? createDefaultMaintenanceState(),
        source: this.lastKnownState ? "last-known" : "default",
        environmentForced: false,
        stale: true,
      });
    }
  }

  async getEffectiveState(
    options: { fresh?: boolean } = {},
  ): Promise<MaintenanceSnapshot> {
    const redisSnapshot = await this.getRedisState(options);
    if (!isMaintenanceEnvironmentForced(this.environment)) {
      return redisSnapshot;
    }

    return {
      state: resolveEnvironmentMaintenanceState(
        redisSnapshot.state,
        this.environment,
      ),
      source: "environment",
      environmentForced: true,
      stale: redisSnapshot.stale,
    };
  }

  async updateState(input: MaintenanceUpdate): Promise<MaintenanceSnapshot> {
    if (
      isMaintenanceEnvironmentForced(this.environment) &&
      input.enabled === false
    ) {
      throw new MaintenanceEnvironmentOverrideError();
    }

    const current = await this.getRedisState({ fresh: true });
    const state = normalizeMaintenanceUpdate(input, {
      baseState: current.state,
      now: this.now,
    });
    await this.store.set(MAINTENANCE_REDIS_KEY, JSON.stringify(state));
    this.lastKnownState = state;
    this.setCache({
      state,
      source: "redis",
      environmentForced: false,
      stale: false,
    });

    if (isMaintenanceEnvironmentForced(this.environment)) {
      return {
        state: resolveEnvironmentMaintenanceState(state, this.environment),
        source: "environment",
        environmentForced: true,
        stale: false,
      };
    }

    return this.cache!.snapshot;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  async close(): Promise<void> {
    this.invalidateCache();
    await this.store.close();
  }
}

type MaintenanceGlobal = typeof globalThis & {
  __findAppMaintenanceService?: MaintenanceService;
};

const maintenanceGlobal = globalThis as MaintenanceGlobal;

export function getMaintenanceService(): MaintenanceService {
  maintenanceGlobal.__findAppMaintenanceService ??= new MaintenanceService({
    store: createMaintenanceRedisStore(),
  });
  return maintenanceGlobal.__findAppMaintenanceService;
}

export async function closeMaintenanceService(): Promise<void> {
  const service = maintenanceGlobal.__findAppMaintenanceService;
  if (!service) return;
  maintenanceGlobal.__findAppMaintenanceService = undefined;
  await service.close();
}
