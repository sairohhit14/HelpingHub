import { Badge } from "@/components/ui/badge";
import { STATUS_META, PRIORITY_META } from "@/lib/tickets";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const meta = STATUS_META[status ?? ""] ?? { label: status ?? "—", varName: "--muted-foreground" };
  return (
    <Badge variant="outline" style={{ color: `var(${meta.varName})`, borderColor: `color-mix(in oklab, var(${meta.varName}) 40%, transparent)` }}>
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  const meta = PRIORITY_META[priority ?? ""] ?? { label: priority ?? "—", varName: "--muted-foreground" };
  return (
    <Badge variant="outline" style={{ color: `var(${meta.varName})`, borderColor: `color-mix(in oklab, var(${meta.varName}) 40%, transparent)` }}>
      {meta.label}
    </Badge>
  );
}
