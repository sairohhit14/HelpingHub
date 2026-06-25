import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/ticket-badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/tickets";

export const Route = createFileRoute("/_authenticated/admin/tickets")({
  head: () => ({ meta: [{ title: "All tickets — Admin" }] }),
  component: AdminTickets,
});

function AdminTickets() {
  const { isAdmin } = useAuth();
  const { data: tickets = [] } = useQuery({
    queryKey: ["admin-all-tickets"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("tickets")
      .select("id, ticket_number, subject, status, priority, created_at, customer_id, assigned_agent_id, ticket_categories(name)")
      .order("created_at", { ascending: false }).limit(500)).data ?? [],
  });
  if (!isAdmin) return <div className="text-sm text-muted-foreground">Admins only.</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">All tickets</h1>
        <p className="text-sm text-muted-foreground">Every ticket across the system.</p>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">
                  <Link to="/tickets/$id" params={{ id: t.id }} className="hover:underline">{t.ticket_number}</Link>
                </TableCell>
                <TableCell><Link to="/tickets/$id" params={{ id: t.id }} className="hover:underline">{t.subject}</Link></TableCell>
                <TableCell className="text-muted-foreground">{(t.ticket_categories as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
                <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                <TableCell className="text-muted-foreground text-xs">{formatDate(t.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
