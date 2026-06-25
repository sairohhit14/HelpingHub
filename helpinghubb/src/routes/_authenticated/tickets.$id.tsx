import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { addComment, updateTicket } from "@/lib/tickets.functions";
import { StatusBadge, PriorityBadge } from "@/components/ticket-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, PRIORITIES, STATUSES } from "@/lib/tickets";
import { ArrowLeft, Eye, Paperclip, Send, Upload, ExternalLink, Bot, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tickets/$id")({
  head: () => ({ meta: [{ title: "Ticket — HelpDesk" }] }),
  component: TicketDetail,
});

function TicketDetail() {
  const { id } = Route.useParams();
  const { user, isAdmin, isAgent } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = isAdmin || isAgent;

  const { data: ticket } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, ticket_categories(name), issue_types(label)")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["ticket-comments", id],
    queryFn: async () => (await supabase.from("ticket_comments").select("*").eq("ticket_id", id).order("created_at")).data ?? [],
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["ticket-attachments", id],
    queryFn: async () => (await supabase.from("ticket_attachments").select("*").eq("ticket_id", id).order("created_at")).data ?? [],
  });

  const { data: history = [] } = useQuery({
    queryKey: ["ticket-history", id],
    queryFn: async () => (await supabase.from("ticket_history").select("*").eq("ticket_id", id).order("created_at")).data ?? [],
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agent-list"],
    enabled: isStaff,
    queryFn: async () => {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "agent");
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as Array<{ id: string; full_name: string }>;
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return data ?? [];
    },
  });

  const addCommentFn = useServerFn(addComment);
  const updateFn = useServerFn(updateTicket);

  const commentMutation = useMutation({
    mutationFn: addCommentFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", id] });
      toast.success("Reply posted");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history", id] });
      toast.success("Ticket updated");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null);

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("ticket-attachments").upload(path, file);
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("ticket_attachments").insert({
        ticket_id: id,
        uploader_id: user!.id,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (dbErr) throw dbErr;
      queryClient.invalidateQueries({ queryKey: ["ticket-attachments", id] });
      toast.success("File uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const openAttachment = async (a: { file_path: string; file_name: string; mime_type: string | null }) => {
    const { data, error } = await supabase.storage.from("ticket-attachments").createSignedUrl(a.file_path, 300);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Failed");
    setPreview({ url: data.signedUrl, name: a.file_name, mime: a.mime_type ?? "" });
  };

  if (!ticket) return <div className="text-sm text-muted-foreground">Loading ticket…</div>;

  const visibleComments = isStaff ? comments : comments.filter((c) => !c.is_internal);
  const cat = (ticket as { ticket_categories?: { name?: string } | null }).ticket_categories;
  const issue = (ticket as { issue_types?: { label?: string } | null }).issue_types;

  return (
    <div className="space-y-4">
      <Link to="/tickets" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />Back to tickets</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          <div className="mt-2 flex gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Description</CardTitle></CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                <Meta label="Category" value={cat?.name} />
                <Meta label="Issue" value={issue?.label} />
                <Meta label="Booking ref" value={ticket.booking_reference} />
                <Meta label="PNR" value={ticket.pnr_number} />
                <Meta label="Transaction" value={ticket.transaction_id} />
                <Meta label="Created" value={formatDate(ticket.created_at)} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Conversation</CardTitle></CardHeader>
            <CardContent>
              <Tabs defaultValue="comments">
                <TabsList>
                  <TabsTrigger value="comments">Replies ({visibleComments.length})</TabsTrigger>
                  <TabsTrigger value="history">History ({history.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="comments" className="space-y-3 pt-4">
                  {visibleComments.length === 0 && <p className="text-sm text-muted-foreground">No replies yet.</p>}
                  {visibleComments.map((c) => (
                    <div key={c.id} className={`rounded-lg border p-3 ${c.is_internal ? "border-priority-medium/30 bg-priority-medium/5" : "bg-card"}`}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Avatar className="h-6 w-6"><AvatarFallback>{(c.author_id ?? "??").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                        <span>{formatDate(c.created_at)}</span>
                        {c.is_internal && <span className="ml-auto rounded bg-priority-medium/20 px-1.5 py-0.5 text-priority-medium">internal</span>}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>
                    </div>
                  ))}
                  <div className="space-y-2 border-t pt-3">
                    <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" rows={3} />
                    <div className="flex items-center justify-between">
                      {isStaff ? (
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Checkbox checked={internal} onCheckedChange={(v) => setInternal(!!v)} />
                          Internal note (hidden from customer)
                        </label>
                      ) : <span />}
                      <Button
                        disabled={!reply.trim() || commentMutation.isPending}
                        onClick={() => {
                          commentMutation.mutate({ data: { ticket_id: id, body: reply, is_internal: internal } });
                          setReply(""); setInternal(false);
                        }}
                      ><Send className="mr-2 h-4 w-4" />Send</Button>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="history" className="space-y-2 pt-4">
                  {history.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
                  {history.map((h) => (
                    <div key={h.id} className="flex items-start gap-3 text-sm">
                      <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                      <div>
                        <div className="text-foreground">
                          <span className="font-medium">{h.action.replace(/_/g, " ")}</span>
                          {h.from_value && <> · {h.from_value} → {h.to_value}</>}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatDate(h.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {isStaff && (
            <Card>
              <CardHeader><CardTitle>Manage</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={ticket.status} onValueChange={(v) => updateMutation.mutate({ data: { id, status: v as never } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Priority</Label>
                  <Select value={ticket.priority} onValueChange={(v) => updateMutation.mutate({ data: { id, priority: v as never } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {isAdmin && (
                  <div className="space-y-1">
                    <Label>Assigned agent</Label>
                    <Select value={ticket.assigned_agent_id ?? ""} onValueChange={(v) => updateMutation.mutate({ data: { id, assigned_agent_id: v || null } })}>
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name || a.id.slice(0,8)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Resolution notes</Label>
                  <Textarea
                    defaultValue={ticket.resolution_notes ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (ticket.resolution_notes ?? ""))
                        updateMutation.mutate({ data: { id, resolution_notes: e.target.value } });
                    }}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {!isStaff && ticket.status === "resolved" && user?.id === ticket.customer_id && (
            <Card>
              <CardHeader><CardTitle>Confirm resolution</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Your agent has marked this ticket as resolved. If your issue is fully sorted, close the ticket. Otherwise, reply above to re-open the conversation.
                </p>
                {ticket.resolution_notes && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{ticket.resolution_notes}</div>
                )}
                <Button
                  className="w-full"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ data: { id, status: "closed" } })}
                >
                  Confirm & close ticket
                </Button>
              </CardContent>
            </Card>
          )}



          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Paperclip className="h-4 w-4" />Attachments</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {attachments.length === 0 && <p className="text-sm text-muted-foreground">No files attached.</p>}
              {attachments.map((a) => {
                const isImage = (a.mime_type ?? "").startsWith("image/");
                return (
                  <div key={a.id} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
                    {isImage && <AttachmentThumb path={a.file_path} name={a.file_name} />}
                    <button
                      onClick={() => openAttachment(a)}
                      className="flex-1 truncate text-left text-sm hover:underline"
                      title={a.file_name}
                    >
                      {a.file_name}
                    </button>
                    <Button
                      type="button" size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => openAttachment(a)}
                      title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed py-3 text-sm text-muted-foreground hover:bg-accent/30">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload file"}
                <Input
                  type="file" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </CardContent>
          </Card>

          <RefundCard ticketId={id} customerId={ticket.customer_id} />

          <AiChatCard ticket={{
            ticket_number: ticket.ticket_number,
            subject: ticket.subject,
            status: ticket.status,
            priority: ticket.priority,
            description: ticket.description,
            booking_reference: ticket.booking_reference,
            pnr_number: ticket.pnr_number,
            transaction_id: ticket.transaction_id,
            category: cat?.name ?? null,
            issue: issue?.label ?? null,
          }} />
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="flex max-h-[60vh] items-center justify-center overflow-auto rounded-md border bg-muted/30 p-2">
                {preview.mime.startsWith("image/") ? (
                  <img src={preview.url} alt={preview.name} className="max-h-[55vh] w-auto object-contain" />
                ) : preview.mime === "application/pdf" ? (
                  <iframe src={preview.url} title={preview.name} className="h-[55vh] w-full" />
                ) : preview.mime.startsWith("video/") ? (
                  <video src={preview.url} controls className="max-h-[55vh] w-full" />
                ) : (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Preview not available for this file type.
                  </p>
                )}
              </div>
              <div className="flex justify-end">
                <a href={preview.url} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm"><ExternalLink className="mr-2 h-4 w-4" />Open original</Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function AttachmentThumb({ path, name }: { path: string; name: string }) {
  const { data: url } = useQuery({
    queryKey: ["att-thumb", path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("ticket-attachments").createSignedUrl(path, 300);
      return data?.signedUrl ?? "";
    },
    staleTime: 4 * 60 * 1000,
  });
  if (!url) return <div className="h-10 w-10 rounded bg-muted" />;
  return <img src={url} alt={name} className="h-10 w-10 rounded object-cover" />;
}

type RefundMethod = "bank_account" | "upi" | "transaction";

function RefundCard({ ticketId, customerId }: { ticketId: string; customerId: string }) {
  const { user, isAdmin, isAgent } = useAuth();
  const queryClient = useQueryClient();
  const { data: refunds = [] } = useQuery({
    queryKey: ["ticket-refunds", ticketId],
    queryFn: async () => (await supabase.from("refund_requests").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: false })).data ?? [],
  });
  const isOwner = user?.id === customerId;
  const isStaff = isAdmin || isAgent;

  const [numTickets, setNumTickets] = useState("");
  const [ticketPrice, setTicketPrice] = useState("");
  const [chargePerTicket, setChargePerTicket] = useState("100");
  const [method, setMethod] = useState<RefundMethod>("bank_account");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upiId, setUpiId] = useState("");
  const [txnId, setTxnId] = useState("");
  const [reason, setReason] = useState("");

  const n = Number(numTickets) || 0;
  const p = Number(ticketPrice) || 0;
  const c = Number(chargePerTicket) || 0;
  const total = +(n * p).toFixed(2);
  const charge = +(n * c).toFixed(2);
  const refundAmount = +Math.max(0, total - charge).toFixed(2);

  const methodError = (): string | null => {
    if (method === "bank_account") {
      if (!accountHolder.trim()) return "Enter the account holder name";
      if (!/^\d{6,18}$/.test(accountNumber)) return "Enter a valid account number (6–18 digits)";
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) return "Enter a valid IFSC code (e.g. HDFC0001234)";
      return null;
    }
    if (method === "upi") {
      if (!/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId)) return "Enter a valid UPI ID (e.g. name@bank)";
      return null;
    }
    if (txnId.trim().length < 6) return "Enter the original transaction ID (min 6 characters)";
    return null;
  };

  const create = async () => {
    if (n <= 0) return toast.error("Enter how many tickets you purchased");
    if (p <= 0) return toast.error("Enter the price per ticket");
    const mErr = methodError();
    if (mErr) return toast.error(mErr);
    const { error } = await supabase.from("refund_requests").insert({
      ticket_id: ticketId,
      requested_by: user!.id,
      amount: refundAmount,
      reason,
      num_tickets: n,
      ticket_price: p,
      total_paid: total,
      charge_per_ticket: c,
      charge_amount: charge,
      refund_amount: refundAmount,
      refund_method: method,
      account_holder: method === "bank_account" ? accountHolder : null,
      account_number: method === "bank_account" ? accountNumber : null,
      ifsc_code: method === "bank_account" ? ifsc.toUpperCase() : null,
      upi_id: method === "upi" ? upiId : null,
      transaction_id: method === "transaction" ? txnId : null,
    });
    if (error) return toast.error(error.message);
    setNumTickets(""); setTicketPrice(""); setReason("");
    setAccountHolder(""); setAccountNumber(""); setIfsc(""); setUpiId(""); setTxnId("");
    queryClient.invalidateQueries({ queryKey: ["ticket-refunds", ticketId] });
    toast.success("Refund requested");
  };

  const verify = async (rid: string) => {
    const { error } = await supabase.from("refund_requests").update({ verified: true }).eq("id", rid);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["ticket-refunds", ticketId] });
    toast.success("Details verified");
  };

  const decide = async (rid: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("refund_requests")
      .update({ status, decided_by: user!.id, decided_at: new Date().toISOString() })
      .eq("id", rid);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["ticket-refunds", ticketId] });
    toast.success(`Refund ${status}`);
  };

  return (
    <Card>
      <CardHeader><CardTitle>Cancel & Refund</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {refunds.length === 0 && <p className="text-sm text-muted-foreground">No refund requests.</p>}
        {refunds.map((r) => (
          <div key={r.id} className="space-y-1 rounded-md border p-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="font-medium">Refund ₹{r.refund_amount ?? r.amount}</div>
              <span className={`rounded px-2 py-0.5 text-xs capitalize ${
                r.status === "approved" ? "bg-status-resolved/20 text-status-resolved" :
                r.status === "rejected" ? "bg-destructive/20 text-destructive" :
                "bg-status-pending/20 text-status-pending"
              }`}>{r.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
              {r.num_tickets != null && <div>Tickets: <span className="text-foreground">{r.num_tickets}</span></div>}
              {r.ticket_price != null && <div>Price: <span className="text-foreground">₹{r.ticket_price}</span></div>}
              {r.total_paid != null && <div>Paid: <span className="text-foreground">₹{r.total_paid}</span></div>}
              {r.charge_amount != null && <div>Charge: <span className="text-foreground">₹{r.charge_amount}</span></div>}
            </div>
            {r.refund_method && (
              <div className="text-xs text-muted-foreground">
                Method: <span className="text-foreground capitalize">{String(r.refund_method).replace("_", " ")}</span>
                {r.refund_method === "bank_account" && <> · A/C {r.account_number} · IFSC {r.ifsc_code}</>}
                {r.refund_method === "upi" && <> · {r.upi_id}</>}
                {r.refund_method === "transaction" && <> · Txn {r.transaction_id}</>}
                {" · "}{r.verified ? <span className="text-status-resolved">verified</span> : <span className="text-status-pending">unverified</span>}
              </div>
            )}
            {r.reason && <div className="text-xs text-muted-foreground">Reason: {r.reason}</div>}
            {isStaff && r.status === "pending" && (
              <div className="mt-2 flex flex-wrap gap-2">
                {!r.verified && <Button size="sm" variant="outline" onClick={() => verify(r.id)}>Verify details</Button>}
                <Button size="sm" variant="outline" disabled={!r.verified} onClick={() => decide(r.id, "approved")}>Approve & refund</Button>
                <Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected")}>Reject</Button>
              </div>
            )}
          </div>
        ))}

        {isOwner && (
          <div className="space-y-2 border-t pt-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Tickets</Label>
                <Input type="number" min="1" value={numTickets} onChange={(e) => setNumTickets(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price/ticket</Label>
                <Input type="number" min="0" step="0.01" value={ticketPrice} onChange={(e) => setTicketPrice(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Charge/ticket</Label>
                <Input type="number" min="0" step="0.01" value={chargePerTicket} onChange={(e) => setChargePerTicket(e.target.value)} />
              </div>
            </div>
            <div className="rounded-md bg-muted/40 p-2 text-xs">
              <div>Total paid: <span className="font-medium text-foreground">₹{total.toFixed(2)}</span></div>
              <div>Cancellation charges: <span className="font-medium text-foreground">₹{charge.toFixed(2)}</span></div>
              <div>Refundable: <span className="font-semibold text-status-resolved">₹{refundAmount.toFixed(2)}</span></div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Refund method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as RefundMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_account">Bank account</SelectItem>
                  <SelectItem value="upi">UPI ID</SelectItem>
                  <SelectItem value="transaction">Original transaction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {method === "bank_account" && (
              <div className="space-y-2">
                <Input placeholder="Account holder name" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
                <Input placeholder="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} />
                <Input placeholder="IFSC code" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} />
              </div>
            )}
            {method === "upi" && (
              <Input placeholder="name@bank" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
            )}
            {method === "transaction" && (
              <Input placeholder="Original transaction ID" value={txnId} onChange={(e) => setTxnId(e.target.value)} />
            )}
            <Textarea placeholder="Reason (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" className="w-full" onClick={create}>Request refund</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type AiTicketCtx = {
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  description: string;
  booking_reference: string | null;
  pnr_number: string | null;
  transaction_id: string | null;
  category: string | null;
  issue: string | null;
};

function AiChatCard({ ticket }: { ticket: AiTicketCtx }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    { role: "assistant", content: `Hi! I can help you discuss ticket ${ticket.ticket_number}. Ask me anything about the issue, possible fixes, or next steps.` },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const resp = await fetch("/api/ticket-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, messages: next }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(err || `Error ${resp.status}`);
      }
      const { content } = (await resp.json()) as { content: string };
      setMessages((m) => [...m, { role: "assistant", content: content || "(no response)" }]);
    } catch (e) {
      toast.error((e as Error).message);
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, I couldn't reach the assistant. Please try again." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Chat with AI Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}
              <div className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" /> Thinking…
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the assistant…"
            disabled={sending}
          />
          <Button onClick={send} disabled={!input.trim() || sending} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

