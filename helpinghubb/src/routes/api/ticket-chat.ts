import { createFileRoute } from "@tanstack/react-router";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export const Route = createFileRoute("/api/ticket-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.PLATFORM_API_KEY;
        if (!key) return new Response("Missing PLATFORM_API_KEY", { status: 500 });

        let body: { messages?: ChatMessage[]; ticket?: Record<string, unknown> };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) return new Response("messages required", { status: 400 });

        const t = body.ticket ?? {};
        const systemPrompt = `You are a helpful support assistant embedded inside a customer support ticket.
Help the user discuss and work toward a resolution. Be concise, practical, and friendly.
Use markdown sparingly. If you do not know something specific to their booking, ask a clarifying question.

Ticket context:
- Number: ${t.ticket_number ?? "n/a"}
- Subject: ${t.subject ?? "n/a"}
- Status: ${t.status ?? "n/a"}
- Priority: ${t.priority ?? "n/a"}
- Category: ${t.category ?? "n/a"}
- Issue type: ${t.issue ?? "n/a"}
- Booking ref: ${t.booking_reference ?? "n/a"}
- PNR: ${t.pnr_number ?? "n/a"}
- Transaction: ${t.transaction_id ?? "n/a"}
- Description: ${t.description ?? "n/a"}`;

        const resp = await fetch("https://ai.gateway.platform.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Platform-API-Key": key,
            "X-Platform-AIG-SDK": "fetch",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "system", content: systemPrompt }, ...messages],
          }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          if (resp.status === 429) {
            return new Response("AI assistant is busy. Please try again shortly.", { status: 429 });
          }
          if (resp.status === 402) {
            return new Response("AI credits exhausted. Please contact support.", { status: 402 });
          }
          return new Response(text || "AI gateway error", { status: 500 });
        }
        const json = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content ?? "";
        return Response.json({ content });
      },
    },
  },
});
