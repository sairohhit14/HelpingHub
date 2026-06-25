import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, PriorityBadge } from "@/components/ticket-badges";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, PRIORITIES, STATUSES } from "@/lib/tickets";
import { ShieldCheck, CheckCircle2, XCircle, Search, Users, Ticket as TicketIcon, Wallet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/console")({
  head: () => ({ meta: [{ title: "Admin Console — HelpDesk" }] }),
  component: AdminConsole,
});

function AdminConsole() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const { data: tickets = [] } = useQuery({
    queryKey: ["admin-console-tickets"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("tickets")
      .select("id, ticket_number, subject, status, priority, created_at, customer_id, assigned_agent_id, escalation_level")
      .order("created_at", { ascending: false }).limit(500)).data ?? [],
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["admin-console-agents"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ["admin", "agent"]);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return profiles ?? [];
    },
  });

  const { data: refunds = [] } = useQuery({
    queryKey: ["admin-console-refunds"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("refund_requests")
      .select("*, tickets(ticket_number, subject)")
      .order("created_at", { ascending: false }).limit(200)).data ?? [],
  });

  const updateTicket = useMutation({
    mutationFn: async (vars: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("tickets").update(vars.patch as never).eq("id", vars.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-console-tickets"] });
      toast.success("Ticket updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decideRefund = useMutation({
    mutationFn: async (vars: { id: string; status: "approved" | "rejected"; verified?: boolean }) => {
      const patch: Record<string, unknown> = {
        status: vars.status,
        decided_at: new Date().toISOString(),
      };
      if (vars.verified) patch.verified = true;
      const { error } = await supabase.from("refund_requests").update(patch as never).eq("id", vars.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-console-refunds"] });
      toast.success("Refund decision saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (!needle) return true;
      return (
        t.ticket_number.toLowerCase().includes(needle) ||
        (t.subject ?? "").toLowerCase().includes(needle)
      );
    });
  }, [tickets, q, statusFilter, priorityFilter]);

  const pendingRefunds = refunds.filter((r) => r.status === "pending").length;
  const unassigned = tickets.filter((t) => !t.assigned_agent_id && t.status !== "closed" && t.status !== "resolved").length;
  const escalated = tickets.filter((t) => (t.escalation_level ?? 0) > 0).length;

  if (!isAdmin) {
    return <div className="text-sm text-muted-foreground">Admins only.</div>;
  }

  const agentName = (id: string | null) => {
    if (!id) return "Unassigned";
    const a = agents.find((p) => p.id === id);
    return a?.full_name || a?.email || id.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-primary" /> Admin Console
          </h1>
          <p className="text-sm text-muted-foreground">Approve, assign, and control every ticket and refund.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/users"><Button variant="outline"><Users className="mr-2 h-4 w-4" />Users</Button></Link>
          <Link to="/admin/reports"><Button variant="outline">Reports</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={<TicketIcon className="h-4 w-4" />} label="Total tickets" value={tickets.length} />
        <StatTile icon={<AlertTriangle className="h-4 w-4 text-status-pending" />} label="Unassigned" value={unassigned} />
        <StatTile icon={<AlertTriangle className="h-4 w-4 text-priority-critical" />} label="Escalated" value={escalated} />
        <StatTile icon={<Wallet className="h-4 w-4 text-priority-high" />} label="Pending refunds" value={pendingRefunds} />
      </div>

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">Ticket control ({filtered.length})</TabsTrigger>
          <TabsTrigger value="refunds">Refund approvals ({pendingRefunds})</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-3 pt-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by ticket number or subject" className="pl-8" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assigned agent</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Quick actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">
                      <Link to="/tickets/$id" params={{ id: t.id }} className="hover:underline">{t.ticket_number}</Link>
                      {(t.escalation_level ?? 0) > 0 && (
                        <Badge variant="destructive" className="ml-2">SLA</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">{t.subject}</TableCell>
                    <TableCell>
                      <Select value={t.status} onValueChange={(v) => updateTicket.mutate({ id: t.id, patch: { status: v } })}>
                        <SelectTrigger className="h-8 w-36"><SelectValue><StatusBadge status={t.status} /></SelectValue></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={t.priority} onValueChange={(v) => updateTicket.mutate({ id: t.id, patch: { priority: v } })}>
                        <SelectTrigger className="h-8 w-32"><SelectValue><PriorityBadge priority={t.priority} /></SelectValue></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={t.assigned_agent_id ?? "none"}
                        onValueChange={(v) => updateTicket.mutate({
                          id: t.id,
                          patch: { assigned_agent_id: v === "none" ? null : v, status: v === "none" ? t.status : "assigned" },
                        })}
                      >
                        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue>{agentName(t.assigned_agent_id)}</SelectValue></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(t.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="outline"
                        onClick={() => updateTicket.mutate({ id: t.id, patch: { status: "resolved", resolution_notes: "Approved by admin" } })}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Approve & resolve
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No tickets match.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="refunds" className="space-y-3 pt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Charges</TableHead>
                  <TableHead>Refund</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      <Link to="/tickets/$id" params={{ id: r.ticket_id }} className="hover:underline">
                        {(r.tickets as { ticket_number?: string } | null)?.ticket_number ?? r.ticket_id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{(r.refund_method ?? "").replace("_", " ")}</TableCell>
                    <TableCell className="text-xs">
                      {r.refund_method === "bank_account" && <>{r.account_holder} • {r.account_number} • {r.ifsc_code}</>}
                      {r.refund_method === "upi" && <>{r.upi_id}</>}
                      {r.refund_method === "transaction" && <>Txn: {r.transaction_id}</>}
                    </TableCell>
                    <TableCell>{r.num_tickets} × ₹{r.ticket_price} − ₹{r.charge_amount}</TableCell>
                    <TableCell className="font-medium">₹{r.refund_amount}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="capitalize">
                        {r.status}
                      </Badge>
                      {r.verified && <Badge variant="outline" className="ml-1">verified</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => decideRefund.mutate({ id: r.id, status: "approved", verified: true })}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => decideRefund.mutate({ id: r.id, status: "rejected" })}>
                            <XCircle className="mr-1 h-3.5 w-3.5" />Reject
                          </Button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {refunds.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No refund requests yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{icon}{label}</CardTitle>
      </CardHeader>
      <CardContent><div className="text-2xl font-semibold">{value}</div></CardContent>
    </Card>
  );
}
