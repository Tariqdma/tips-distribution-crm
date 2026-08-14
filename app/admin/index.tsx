import { AdminDashboard } from "@/app/(tabs)/admin";
import { AdminWebShell } from "@/components/admin-web-shell";

export default function AdminPortalIndex() {
  return <AdminWebShell title="نظرة عامة"><AdminDashboard /></AdminWebShell>;
}
