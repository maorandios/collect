import { he } from "@/lib/i18n/he";

export default function AppLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {he.loading.page}
    </div>
  );
}
