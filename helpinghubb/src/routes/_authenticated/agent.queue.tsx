import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/ticket-badges";
import { formatDate, PRIORITIES, STATUSES } from "@/lib/tickets";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agent/queue")({
  head: () => ({ meta: [{ title: "My Queue — HelpDesk" }] }),
  component: AgentQueue,
});

// SLA targets in hours (from check_sla_escalations)
const SLA_HOURS: Record<string, number> = { critical: 2, high: 4, medium: 24, low: 48 };

function slaRemaining(priority: string, createdAt: string): { label: string; tone: string } {
  const hrs = SLA_HOURS[priority] ?? 24;
  const deadline = new Date(createdAt).getTime() + hrs * 3600 * 1000;
  const ms = deadline - Date.now();
  if (ms <= 0) {
    const over = Math.abs(ms) / 3600000;
    return { label: `Overdue ${over < 1 ? `${Math.round(over * 60)}m` : `${over.toFixed(1)}h`}`, tone: "text-destructive font-medium" };
  }
  const h = ms / 3600000;
  const label = h < 1 ? `${Math.round(h * 60)}m left` : `${h.toFixed(1)}h left`;
  return { label, tone: h < 1 ? "text-priority-high" : "text-muted-foreground" };
}

function AgentQueue() {
  const { user, isAdmin, isAgent } = useAuth();
  const [priority, setPriority] = useState<string>("all");
  const [status, setStatus] = useState<string>("active");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["agent-queue", user?.id, priority, status],
    enabled: !!user && (isAdmin || isAgent),
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select("id, ticket_number, subject, status, priority, created_at, assigned_at, customer_id, category_id, issue_type_id, ticket_categories(name), issue_types(label), profiles!tickets_customer_id_fkey(full_name)")
        .eq("assigned_agent_id", user!.id)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(300);
      if (priority !== "all") q = q.eq("priority", priority as never);
      if (status === "active") q = q.not("status", "in", "(resolved,closed)");
      else if (status !== "all") q = q.eq("status", status as never);
      const { data } = await q;
      return data ?? [];
    },
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of tickets) c[t.priority] = (c[t.priority] ?? 0) + 1;
    return c;
  }, [tickets]);

  if (!(isAdmin || isAgent)) {
    return <div className="text-sm text-muted-foreground">Agent workspace is only available to staff.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Inbox className="h-5 w-5" /> My Assigned Tickets</h1>
          <p className="text-sm text-muted-foreground">Tickets you own — investigate, communicate, resolve.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {PRIORITIES.map((p) => (
          <Card key={p} className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{p}</div>
            <div className="mt-1 text-2xl font-semibold">{counts[p] ?? 0}</div>
          </Card>
        ))}
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-2 text-muted-foreground">Priority:</span>
          <FilterPill active={priority === "all"} onClick={() => setPriority("all")}>All</FilterPill>
          {PRIORITIES.map((p) => (
            <FilterPill key={p} active={priority === p} onClick={() => setPriority(p)} className="capitalize">{p}</FilterPill>
          ))}
          <span className="ml-4 mr-2 text-muted-foreground">Status:</span>
          <FilterPill active={status === "active"} onClick={() => setStatus("active")}>Active</FilterPill>
          {STATUSES.map((s) => (
            <FilterPill key={s} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s.replace(/_/g, " ")}</FilterPill>
          ))}
          <FilterPill active={status === "all"} onClick={() => setStatus("all")}>All</FilterPill>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>SLA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && tickets.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nothing in your queue. 🎉</TableCell></TableRow>
            )}
            {tickets.map((t) => {
              const sla = slaRemaining(t.priority, t.created_at);
              const cat = (t.ticket_categories as { name?: string } | null)?.name;
              const issue = (t.issue_types as { label?: string } | null)?.label;
              const cust = (t.profiles as { full_name?: string } | null)?.full_name;
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">
                    <Link to="/tickets/$id" params={{ id: t.id }} className="hover:underline">{t.ticket_number}</Link>
                    <div className="mt-0.5 max-w-[260px] truncate font-sans text-sm text-foreground">{t.subject}</div>
                  </TableCell>
                  <TableCell className="text-sm">{cust || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{cat || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{issue || "—"}</TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(t.assigned_at ?? t.created_at)}</TableCell>
                  <TableCell className={`text-xs ${sla.tone}`}>{["resolved","closed"].includes(t.status) ? "—" : sla.label}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function FilterPill({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} className={`h-7 px-2.5 text-xs ${className ?? ""}`} onClick={onClick}>
      {children}
    </Button>
  );
}
