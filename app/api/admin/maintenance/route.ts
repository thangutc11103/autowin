import {
  getRequestUserId,
  requireAdmin,
} from "@/lib/auth/access-control";
import { getCurrentUser } from "@/lib/auth/session-auth";
import { createMaintenanceAdminApi } from "@/lib/maintenance/admin-api";
import { getMaintenanceService } from "@/lib/maintenance/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maintenanceAdminApi = createMaintenanceAdminApi({
  requireAdmin,
  getCurrentUser,
  getRequestUserId,
  service: getMaintenanceService(),
});

export async function GET(request: Request): Promise<Response> {
  return maintenanceAdminApi.get(request);
}

export async function PUT(request: Request): Promise<Response> {
  return maintenanceAdminApi.put(request);
}
