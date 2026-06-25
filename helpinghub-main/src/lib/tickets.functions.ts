import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  category_id: z.string().uuid().nullable().optional(),
  issue_type_id: z.string().uuid().nullable().optional(),
  booking_reference: z.string().trim().max(100).optional().nullable(),
  pnr_number: z.string().trim().max(100).optional().nullable(),
  transaction_id: z.string().trim().max(100).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createTicketSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Auto-derive priority from the chosen issue type's default_priority
    // (unless caller explicitly picked a non-default value — we honour explicit input).
    let effectivePriority = data.priority;
    if (data.issue_type_id) {
      const { data: it } = await supabase
        .from("issue_types")
        .select("default_priority")
        .eq("id", data.issue_type_id)
        .maybeSingle();
      const def = (it as { default_priority?: string } | null)?.default_priority;
      if (def && data.priority === "medium") {
        effectivePriority = def as typeof data.priority;
      }
    }

    const { data: ticket, error } = await supabase
      .from("tickets")
      // ticket_number + assigned_agent_id are set by DB triggers
      .insert({ ...data, priority: effectivePriority, customer_id: userId } as never)
      .select("id, ticket_number")
      .single();
    if (error) throw new Error(error.message);


    // Notify staff (admins + agents) that a new ticket needs attention.
    // Uses the admin client because customers cannot insert notifications
    // for users who aren't yet parties to the ticket.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: staff } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "agent"]);
      const recipients = Array.from(new Set((staff ?? []).map((r) => r.user_id)));
      if (recipients.length) {
        await supabaseAdmin.from("notifications").insert(
          recipients.map((uid) => ({
            user_id: uid,
            type: "ticket_created",
            title: `New ticket ${ticket.ticket_number}`,
            body: data.subject,
            ticket_id: ticket.id,
          }))
        );
      }
    } catch { /* notifications are best-effort */ }
    return ticket;
  });

const updateTicketSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "assigned", "in_progress", "pending_customer", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assigned_agent_id: z.string().uuid().nullable().optional(),
  resolution_notes: z.string().max(5000).optional().nullable(),
});

export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateTicketSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { supabase } = context;
    const update: Record<string, unknown> = { ...patch };
    if (patch.assigned_agent_id && patch.status === undefined) update.status = "assigned";
    const { data: t, error } = await supabase
      .from("tickets")
      .update(update as never)
      .eq("id", id)
      .select("id, customer_id, assigned_agent_id, ticket_number, status")
      .single();
    if (error) throw new Error(error.message);

    // Notify customer of status change
    if (patch.status) {
      await supabase.from("notifications").insert({
        user_id: t.customer_id,
        type: "status_updated",
        title: `Ticket ${t.ticket_number} status: ${patch.status}`,
        body: patch.resolution_notes ?? null,
        ticket_id: t.id,
      });
    }
    if (patch.assigned_agent_id) {
      await supabase.from("notifications").insert({
        user_id: patch.assigned_agent_id,
        type: "ticket_assigned",
        title: `You were assigned ticket ${t.ticket_number}`,
        ticket_id: t.id,
      });
    }
    return t;
  });

const addCommentSchema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
  is_internal: z.boolean().default(false),
});

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addCommentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: comment, error } = await supabase
      .from("ticket_comments")
      .insert({ ...data, author_id: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Notify the other party of the reply (skip internal notes)
    if (!data.is_internal) {
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id, ticket_number, subject, customer_id, assigned_agent_id")
        .eq("id", data.ticket_id)
        .single();
      if (ticket) {
        const recipients = new Set<string>();
        if (ticket.customer_id && ticket.customer_id !== userId) recipients.add(ticket.customer_id);
        if (ticket.assigned_agent_id && ticket.assigned_agent_id !== userId) recipients.add(ticket.assigned_agent_id);
        if (recipients.size > 0) {
          await supabase.from("notifications").insert(
            Array.from(recipients).map((uid) => ({
              user_id: uid,
              type: "new_reply",
              title: `New reply on ${ticket.ticket_number}`,
              body: data.body.slice(0, 200),
              ticket_id: ticket.id,
            }))
          );
        }
      }
    }
    return comment;
  });
