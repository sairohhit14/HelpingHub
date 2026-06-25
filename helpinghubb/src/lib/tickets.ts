import type { Database } from "@/integrations/supabase/types";

export type AppRole = "customer" | "agent" | "admin";
export type TicketStatus = Database["public"]["Enums"] extends { ticket_status: infer S } ? S : string;
export type TicketPriority = Database["public"]["Enums"] extends { ticket_priority: infer P } ? P : string;

export const STATUSES = ["open", "assigned", "in_progress", "pending_customer", "resolved", "closed"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export const STATUS_META: Record<string, { label: string; varName: string }> = {
  open: { label: "Open", varName: "--status-open" },
  assigned: { label: "Assigned", varName: "--status-assigned" },
  in_progress: { label: "In Progress", varName: "--status-in-progress" },
  pending_customer: { label: "Pending Customer", varName: "--status-pending" },
  resolved: { label: "Resolved", varName: "--status-resolved" },
  closed: { label: "Closed", varName: "--status-closed" },
};

export const PRIORITY_META: Record<string, { label: string; varName: string }> = {
  low: { label: "Low", varName: "--priority-low" },
  medium: { label: "Medium", varName: "--priority-medium" },
  high: { label: "High", varName: "--priority-high" },
  critical: { label: "Critical", varName: "--priority-critical" },
};

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatDateShort(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
