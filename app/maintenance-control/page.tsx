import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MaintenanceControl from "@/components/admin/maintenance-control";
import {
  getCurrentUserBySessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session-auth";
import { isMaintenanceAdmin } from "@/lib/maintenance/policy";

export const dynamic = "force-dynamic";

export default async function MaintenanceControlPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = sessionToken
    ? await getCurrentUserBySessionToken(sessionToken)
    : null;

  if (!isMaintenanceAdmin(user)) {
    redirect("/");
  }

  return <MaintenanceControl />;
}
