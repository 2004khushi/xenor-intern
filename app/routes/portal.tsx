// routes/portal.tsx
import { Outlet } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "app/utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request); // redirects to /login if not authed
  return null;
}
export default function PortalLayout() {
  return <Outlet />;
}