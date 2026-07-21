import type { NextRequest } from "next/server";
import { handleProxyRequest } from "@/lib/maintenance/proxy-handler";

export async function proxy(request: NextRequest) {
  return handleProxyRequest(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
