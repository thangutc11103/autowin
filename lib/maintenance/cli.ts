import type {
  MaintenanceServiceContract,
  MaintenanceUpdate,
} from "@/lib/maintenance/types";

const USAGE = `Usage:
  npm run maintenance -- status
  npm run maintenance -- on [--title <text>] [--message <text>] [--until <ISO-8601>]
  npm run maintenance -- off`;

export class MaintenanceCliUsageError extends Error {
  constructor(message: string) {
    super(`${message}\n\n${USAGE}`);
    this.name = "MaintenanceCliUsageError";
  }
}

export type MaintenanceCliCommand =
  | { action: "status" }
  | { action: "off" }
  | {
      action: "on";
      title?: string;
      message?: string;
      estimatedEndAt?: string;
    };

export function parseMaintenanceCliArgs(argv: string[]): MaintenanceCliCommand {
  const [action, ...options] = argv;
  if (action === "status" || action === "off") {
    if (options.length > 0) {
      throw new MaintenanceCliUsageError(`${action} does not accept options.`);
    }
    return { action };
  }
  if (action !== "on") {
    throw new MaintenanceCliUsageError("Choose status, on, or off.");
  }

  const command: Extract<MaintenanceCliCommand, { action: "on" }> = {
    action: "on",
  };
  const seen = new Set<string>();
  const optionMap = {
    "--title": "title",
    "--message": "message",
    "--until": "estimatedEndAt",
  } as const;

  for (let index = 0; index < options.length; index += 2) {
    const option = options[index];
    const key = optionMap[option as keyof typeof optionMap];
    const value = options[index + 1];
    if (!key) {
      throw new MaintenanceCliUsageError(`Unknown option: ${option}`);
    }
    if (seen.has(option)) {
      throw new MaintenanceCliUsageError(`Duplicate option: ${option}`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new MaintenanceCliUsageError(`Missing value for ${option}.`);
    }
    seen.add(option);
    command[key] = value;
  }

  return command;
}

interface MaintenanceCliDependencies {
  service: MaintenanceServiceContract;
  username?: string;
  output?: (line: string) => void;
  errorOutput?: (line: string) => void;
  close?: () => Promise<void>;
}

export async function runMaintenanceCli(
  argv: string[],
  dependencies: MaintenanceCliDependencies,
): Promise<number> {
  const output = dependencies.output ?? console.log;
  const errorOutput = dependencies.errorOutput ?? console.error;
  const close = dependencies.close ?? (() => dependencies.service.close());

  try {
    const command = parseMaintenanceCliArgs(argv);
    if (command.action === "status") {
      const redis = await dependencies.service.getRedisState({ fresh: true });
      const effective = await dependencies.service.getEffectiveState();
      output(JSON.stringify({ redis, effective }, null, 2));
      return 0;
    }

    const username = dependencies.username?.trim() || "unknown";
    const update: MaintenanceUpdate = {
      enabled: command.action === "on",
      updatedBy: `cli:${username}`,
    };
    if (command.action === "on") {
      if (command.title !== undefined) update.title = command.title;
      if (command.message !== undefined) update.message = command.message;
      if (command.estimatedEndAt !== undefined) {
        update.estimatedEndAt = command.estimatedEndAt;
      }
    }

    const effective = await dependencies.service.updateState(update);
    output(JSON.stringify({ effective }, null, 2));
    return 0;
  } catch (error) {
    errorOutput(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await close();
  }
}
