import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createTicket } from "@/lib/tickets.functions";
import { PRIORITIES } from "@/lib/tickets";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, X, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tickets/new")({
  head: () => ({ meta: [{ title: "Ticket Problem — HelpDesk" }] }),
  component: NewTicket,
});

function NewTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState<string>("");
  const [issueTypeId, setIssueTypeId] = useState<string>("");
  const [priority, setPriority] = useState<string>("medium");
  const [files, setFiles] = useState<File[]>([]);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("ticket_categories").select("id, name").order("sort_order")).data ?? [],
  });

  const { data: issueTypes = [] } = useQuery({
    queryKey: ["issue-types", categoryId],
    enabled: !!categoryId,
    queryFn: async () => (await supabase.from("issue_types").select("id, label").eq("category_id", categoryId).order("sort_order")).data ?? [],
  });

  useEffect(() => { setIssueTypeId(""); }, [categoryId]);

  const create = useServerFn(createTicket);
  const mutation = useMutation({
    mutationFn: create,
    onSuccess: async (t) => {
      // Upload attachments tied to the new ticket id, then route.
      if (files.length && user) {
        for (const f of files) {
          try {
            const path = `${t.id}/${crypto.randomUUID()}-${f.name}`;
            const { error: upErr } = await supabase.storage.from("ticket-attachments").upload(path, f);
            if (upErr) throw upErr;
            const { error: dbErr } = await supabase.from("ticket_attachments").insert({
              ticket_id: t.id,
              uploader_id: user.id,
              file_path: path,
              file_name: f.name,
              mime_type: f.type,
              size_bytes: f.size,
            });
            if (dbErr) throw dbErr;
          } catch (err) {
            toast.error(`Failed to upload ${f.name}: ${(err as Error).message}`);
          }
        }
      }
      toast.success(`Ticket ${t.ticket_number} created`);
      navigate({ to: "/tickets/$id", params: { id: t.id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      data: {
        subject: String(fd.get("subject") || ""),
        description: String(fd.get("description") || ""),
        category_id: categoryId || null,
        issue_type_id: issueTypeId || null,
        booking_reference: (fd.get("booking_reference") as string) || null,
        pnr_number: (fd.get("pnr_number") as string) || null,
        transaction_id: (fd.get("transaction_id") as string) || null,
        priority: priority as "low" | "medium" | "high" | "critical",
      },
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ticket Problem</h1>
        <p className="text-sm text-muted-foreground">Tell us what happened. Include any booking IDs you have.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Ticket details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Issue type</Label>
                <Select value={issueTypeId} onValueChange={setIssueTypeId} disabled={!categoryId}>
                  <SelectTrigger><SelectValue placeholder={categoryId ? "Select issue" : "Pick category first"} /></SelectTrigger>
                  <SelectContent>
                    {issueTypes.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="subject">Problem</Label>
              <Input id="subject" name="subject" required minLength={3} maxLength={200} placeholder="Briefly describe your problem" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" required minLength={10} maxLength={5000} rows={6} placeholder="Describe the issue, what you expected, and what happened…" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="booking_reference">Booking reference</Label>
                <Input id="booking_reference" name="booking_reference" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pnr_number">PNR number</Label>
                <Input id="pnr_number" name="pnr_number" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="transaction_id">Transaction ID</Label>
                <Input id="transaction_id" name="transaction_id" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Paperclip className="h-4 w-4" />Attachments</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed py-3 text-sm text-muted-foreground hover:bg-accent/30">
                <Upload className="h-4 w-4" />
                Add files (screenshots, receipts, etc.)
                <Input
                  type="file" multiple className="hidden"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    if (list.length) setFiles((prev) => [...prev, ...list]);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {files.length > 0 && (
                <ul className="space-y-1">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm">
                      <span className="flex-1 truncate" title={f.name}>{f.name}</span>
                      <span className="text-xs text-muted-foreground">{Math.round(f.size / 1024)} KB</span>
                      <Button
                        type="button" variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
