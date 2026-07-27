# Org / School Admin Management & Approval — Design

Date: 2026-07-27 · Author: Claude (autonomous, per MSG's standing authority)

## Goal

Platform super admin (muthu@pymasters.net) efficiently manages org/school admins
and the actions they may perform. Org/school admins manage their own org, but
cannot obtain product-level power or free access without platform approval.

Layer 0 (security fixes) shipped separately (commit 2d41d29). This spec covers
Layers 1–3.

## Decisions (confirmed with MSG 2026-07-27)

- **Entitlement is request-gated.** A self-created org gets NO automatic
  entitlement. The creator lands on the normal individual 7-day trial and must
  request a plan/pilot, which the platform admin approves. Enterprise tracks
  require an approved enterprise plan.
- **Existing orgs are grandfathered.** Every org that exists at migration time
  keeps its current access; the stricter entitlement rule applies only to orgs
  created after the change. No live user loses access.

## Layer 1 — Org audit trail

Problem: `organizations.py` has zero audit calls; org-admin actions leave no
trail. `admin_audit` records only platform-admin actions.

- New table `org_audit(id, org_id, actor_id, actor_name, action, target_type,
  target_id, detail, created_at)` — mirrors `admin_audit` shape plus `org_id`.
- Helper `_org_audit(conn, org_id, actor_id, action, ...)` in `organizations.py`,
  called from every mutating endpoint: `create_org`, `update_org`,
  `invite_member`, `bulk_invite`, `join_org`, `change_role`, `remove_member`,
  `set_member_groups`, `delete_organization`, and org_challenges mutations.
- Surfaced two ways: org super_admins see their own org's log
  (`GET /api/org/{org_id}/audit`, super_admin only); platform admin sees any
  org's log via the console (Layer 2).

## Layer 2 — Platform "Org Admins" console

Problem: platform admin can change org roles only via the buried Users-tab
per-user drawer. No consolidated view of who administers each org.

- Super Admin → **Organizations** tab gains an org detail panel listing members
  with roles, with promote/demote/revoke controls (reusing `set_user_org_role`).
- **Add the missing last-super_admin guard** to `admin.py::set_user_org_role`
  (org-scoped `change_role` already has it; the platform-side setter does not —
  a platform admin could orphan an org by demoting its only super_admin).
- **Capability matrix**: a single source of truth mapping org role →
  permitted actions, rendered read-only in the console so the boundary is
  visible. Backend `ROLE_LEVELS` + `require_org_role` already encode this; the
  matrix documents and displays it (no behavior change in this layer).
- Org audit log (from Layer 1) shown per-org in this panel.

## Layer 3 — Org capability request & approval workflow

The core of the ask: org admins request anything product-level; only the
platform admin grants it.

- New table `org_admin_requests(id, org_id, requested_by, kind, payload,
  status, admin_note, handled_by, handled_at, created_at)` where
  `kind ∈ {plan, enterprise_tracks, seats, add_admin}`. Modeled 1:1 on
  `support_requests` (status machine + review queue + audit + email).
- **Org side** (`routes/organizations.py` or a new `routes/org_requests.py`,
  org admin gated): `POST /api/org/{org_id}/requests` to file a request,
  `GET .../requests` to see own org's requests. Rate-limited.
- **Platform side** (`require_super_admin`, audited, emails via
  `platform_settings.get_notification_emails`): list all requests,
  approve/reject. Approve performs the grant (e.g. calls the existing
  `set_org_plan`) and records it. Surfaced in the Super Admin **Support** tab
  (add a "Org Requests" sub-view) or a dedicated tab.
- **Entitlement change (request-gated).** `access.py`: bare `org_members`
  membership no longer implies full access / enterprise tracks. Instead,
  entitlement derives from the org's **assigned plan** (`organizations.plan` in
  PAID_PLANS, unexpired), and enterprise tracks require the org plan to be
  `enterprise`. Super-admin and individually-assigned plans are unchanged.
- **Grandfather migration.** Add `organizations.grandfathered_at` (or reuse a
  boolean). At migration, every existing org is flagged grandfathered and keeps
  today's membership-based access. `access.py` treats a grandfathered org as
  entitled regardless of assigned plan. Orgs created after the change are not
  flagged, so they follow the request-gated rule. This is the ONLY safe way to
  flip the tested 2026-07-02 org-member→enterprise policy without locking out a
  live org.
- Self-serve org signup (`register` with account_type=organization and
  `POST /api/org`) still creates the org, but the creator is on the individual
  trial until a request is approved — no silent entitlement.

## Testing

- Layer 1: every mutating org endpoint writes an `org_audit` row; org audit read
  endpoint authz (super_admin only, own org).
- Layer 2: last-super_admin guard on `set_user_org_role` (cannot demote the only
  org super_admin); platform role change is audited.
- Layer 3: request create/list authz (org admin only, own org); approve grants
  the plan and audits; reject emails requester; grandfathered org keeps
  enterprise access with no assigned plan; NON-grandfathered self-created org is
  on trial (no enterprise) until approved; migration flags all existing orgs.
- Update `test_enterprise_tracks.py` to encode the new request-gated policy
  (grandfathered vs assigned-plan), replacing the bare-membership assertions,
  with an explicit note that this supersedes the 2026-07-02 policy per MSG
  2026-07-27.
- Live verification across roles; frontend build + vitest.

## Rollout order

Independent, shippable in sequence: L1 (audit, zero behavior change) → L2
(console + guard) → L3 (requests + entitlement + migration). Each is its own
commit/deploy with its own tests. L3 is the only one that changes access
behavior and carries the grandfather migration.
