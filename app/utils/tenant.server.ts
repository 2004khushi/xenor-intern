// app/utils/tenant.server.ts
export function getTenantId(request: Request): string {
  const cookieHeader = request.headers.get("Cookie");
  const cookies = new Map(
    cookieHeader?.split(';').map(c => {
      const [key, value] = c.trim().split('=');
      return [key, value];
    }) || []
  );
  
  const tenantId = cookies.get('tenant_id');
  
  if (!tenantId) {
    throw new Error("Tenant ID not found - please select a store first");
  }
  
  return tenantId;
}