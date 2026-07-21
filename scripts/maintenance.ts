import dotenv from "dotenv";
import { runMaintenanceCli } from "@/lib/maintenance/cli";
import {
  closeMaintenanceService,
  getMaintenanceService,
} from "@/lib/maintenance/service";

async function main(): Promise<void> {
  dotenv.config({ path: ".env.local", override: false, quiet: true });
  dotenv.config({ path: ".env", override: false, quiet: true });

  const service = getMaintenanceService();
  process.exitCode = await runMaintenanceCli(process.argv.slice(2), {
    service,
    username: process.env.USERNAME || process.env.USER,
    close: closeMaintenanceService,
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
