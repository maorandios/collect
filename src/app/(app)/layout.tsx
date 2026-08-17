import { requireUser } from "@/lib/auth/require-user";
import { AppSidebar } from "@/components/shell/app-sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <AppSidebar email={user.email ?? null} />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
