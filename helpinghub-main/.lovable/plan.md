
# Support Ticket System — Build Plan

A production-style helpdesk for ticket-booking services (movie / bus / train / flight / event), built on Lovable's stack with the same architecture goals as the Spring Boot brief (separation of concerns, validation, auth, RBAC, reports).

## Stack mapping (Java brief → Lovable stack)

| Java brief | Implementation here |
|---|---|
| Spring Boot REST APIs | TanStack `createServerFn` (typed RPC) + `/api/public/*` routes |
| Spring Security + JWT | Lovable Cloud Auth (JWT-based) + `requireSupabaseAuth` middleware |
| MySQL + JPA | Postgres + RLS policies + typed client |
| Entity / DTO / Repo / Service / Controller | `db schema` / `types` / server fns / route components |
| Global exception handler | Route `errorComponent` + `notFoundComponent` |
| Email notifications | In-app notifications table (email = follow-up; needs Resend secret) |
| Bootstrap 5 UI | Tailwind + shadcn/ui (modern SaaS, light, blue accent) |

## Roles

- **customer** (default on signup)
- **agent** (created by admin)
- **admin** (first user seeded; can promote)

Roles live in a separate `user_roles` table with a `has_role()` security-definer fn (no role-on-profile escalation).

## Database schema

- `profiles` — id (= auth.users.id), full_name, email, mobile, avatar_url, is_active
- `user_roles` — user_id, role (enum: customer/agent/admin)
- `ticket_categories` — slug, name, description (seeded: movie/bus/train/flight/event/payment/refund)
- `issue_types` — category_id, label (seeded with the 15 issue types from the brief)
- `tickets` — id, ticket_number (e.g. `TKT-000123`), customer_id, category_id, issue_type_id, booking_ref, pnr, transaction_id, description, priority (low/med/high/critical), status (open/assigned/in_progress/pending_customer/resolved/closed), assigned_agent_id, resolution_notes, created_at, updated_at, resolved_at
- `ticket_comments` — ticket_id, author_id, body, is_internal (agent-only notes)
- `ticket_attachments` — ticket_id, uploader_id, file_path, file_name, mime, size
- `ticket_history` — ticket_id, actor_id, action, from_value, to_value, created_at (audit trail)
- `notifications` — user_id, type, title, body, ticket_id, read_at
- `refund_requests` — ticket_id, amount, reason, status (pending/approved/rejected), decided_by, decided_at

Storage bucket `ticket-attachments` (private) with RLS so only ticket participants + agents/admins can read.

## RLS (high level)

- Customers: see/modify their own tickets, comments, attachments, notifications, refunds.
- Agents: see all tickets assigned to them + unassigned queue; write comments/notes; update status.
- Admins: full access.
- `is_internal` comments hidden from customers via policy.

## Server functions (REST equivalents)

Auth handled by Supabase client. Server fns for protected actions:

- `tickets`: create, update, assign, changeStatus, addComment, requestInfo, resolve, close, list (role-aware), get
- `attachments`: createSignedUploadUrl, list, delete
- `users` (admin): list, create agent, activate/deactivate, change role
- `refunds`: create, approve, reject, list
- `notifications`: list, markRead, markAllRead
- `analytics`: customerDashboard, agentDashboard, adminDashboard
- `reports`: dailyTickets, weekly, monthly, resolved, pending, refundStats, agentPerformance (CSV export)

## Frontend routes

```
/                              Landing page (marketing)
/auth                          Login / Register / Forgot pwd
/reset-password                Set new password
/_authenticated/
  dashboard                    Role-routed: customer/agent/admin dashboard
  tickets                      List (filters: status/category/date/search)
  tickets/new                  Create ticket (category → issue type → fields)
  tickets/$id                  Detail: timeline, comments, attachments, status, refund
  notifications                In-app inbox
  profile                      Edit profile / change password
  admin/users                  User & agent management
  admin/tickets                All tickets, assign agent, escalate
  admin/reports                Reports & CSV export
```

Shared `AppShell` with collapsible sidebar (shadcn sidebar), top bar with notifications bell + profile menu.

## UI / design system

- **Direction:** Modern SaaS — light surfaces, neutral foreground, blue primary `oklch(0.55 0.20 255)`, subtle borders, soft shadows.
- **Fonts:** Inter (body) + Inter Display weights (headings) via `@fontsource`.
- **Components:** shadcn Card / Table / Tabs / Dialog / Sheet / Badge / Avatar / Select / Sonner toasts.
- **Charts:** Recharts (already in shadcn `chart.tsx`) for dashboards.
- **Tokens:** Status colors (open/assigned/in_progress/pending/resolved/closed) and priority colors (low/med/high/critical) defined as CSS vars in `src/styles.css`.

## Security

- Zod validation on every server fn input.
- RLS on every table + storage bucket.
- `has_role` security-definer fn for role checks (no recursion).
- Admin-only server fns verify `has_role(userId, 'admin')` inside handler.
- Password reset via `/reset-password` page.
- No service-role usage from client modules; admin ops use `await import('@/integrations/supabase/client.server')` inside handlers.

## Build order (this turn)

1. Enable Lovable Cloud.
2. Migration: enums, tables, RLS, grants, `has_role`, triggers (auto-create profile, ticket number generator, history triggers), seed categories + issue types.
3. Storage bucket + policies.
4. Design tokens in `src/styles.css` + fonts.
5. Auth pages (`/auth`, `/reset-password`) + `_authenticated` layout (managed) + role-based redirect.
6. Shared `AppShell` (sidebar + topbar + notifications).
7. Server fns (`src/lib/*.functions.ts`).
8. Customer surface: dashboard, ticket list, create ticket, detail (comments + attachments + refund request).
9. Agent surface: queue, assigned tickets, internal notes, resolve.
10. Admin surface: users, agents, all tickets, reports + CSV.
11. Landing page + SEO meta + sitemap/robots.

## What's out of scope for the first pass (call-outs)

- **Outbound email** notifications require a Resend API key — I'll wire in-app notifications now and we can add email after you add the secret.
- **ER / Use Case diagrams, Test Cases, Deployment Guide** as standalone documents — the schema *is* the ER source of truth; happy to generate Markdown docs on request.
- Generated **PDF reports** — CSV export is included; PDF can be added after.

Reply "go" (or with tweaks) and I'll start building.
