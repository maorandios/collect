import { Badge } from "@/components/ui/badge";
import { requestUiStatus, requestUiStatusLabel } from "@/lib/requests/display";
import { statusLabel } from "@/lib/i18n/status";
import { cn } from "@/lib/utils";

const requestTones: Record<string, string> = {
  scheduled: "border-transparent bg-[#eef1f4] text-[#64748b]",
  sent: "border-transparent bg-[#e8eef3] text-[#475569]",
  filling: "border-transparent bg-[#fef3e2] text-[#b45309]",
  completed: "border-transparent bg-[#e7f4f0] text-[#0f766e]",
  failed: "border-transparent bg-[#fde8e8] text-[#b42318]",
  expired: "border-transparent bg-[#fde8e8] text-[#b42318]",
  draft: "border-transparent bg-[#eef1f4] text-[#64748b]",
};

const otherTones: Record<string, string> = {
  active: "border-transparent bg-[#e7f4f0] text-[#0f766e]",
  paused: "border-transparent bg-[#eef1f4] text-[#64748b]",
  connected: "border-transparent bg-[#e7f4f0] text-[#0f766e]",
  disconnected: "border-transparent bg-[#eef1f4] text-[#64748b]",
  needs_reauth: "border-transparent bg-[#fef3e2] text-[#b45309]",
};

export function StatusBadge({ status }: { status: string }) {
  const ui = requestUiStatus(status);
  const requestClass = requestTones[ui];
  if (requestClass) {
    return (
      <Badge variant="outline" className={cn("font-medium", requestClass)}>
        {requestUiStatusLabel(status)}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn("font-medium", otherTones[status])}>
      {statusLabel(status)}
    </Badge>
  );
}
