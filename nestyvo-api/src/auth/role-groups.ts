import { UserRole } from '../database/entities/user.entity';

// Single source of truth for the role sets every controller's @Roles(...)
// decorator draws from. Charlene flagged (Aug 23, repeated Sep 24) that a
// fix lands on one role's screens but not another's because each route
// hand-typed its own UserRole list from scratch — this file is the fix:
// "what can an agent not do that an admin can" now has exactly one place to
// read, and one place to change, instead of being reconstructed by grepping
// every controller.
//
// This file only NAMES today's existing behavior — it deliberately does not
// change any route's actual access, even where a combination looks
// inconsistent (flagged inline below). Changing real access is a separate,
// explicit decision, not a side effect of this refactor.

/** Strictest tier — Nestyvo-level admin only. */
export const ADMIN_ONLY = [UserRole.ADMINISTRATOR];

/**
 * Admin + scheduling agent, no practice manager, no provider. Only used by
 * GET /practices today. Likely an oversight (a practice manager arguably
 * needs the practice list same as an agent does) — flagging here rather
 * than silently folding PRACTICE_MANAGER in as part of a "just centralize
 * it" refactor.
 */
export const ADMIN_AND_AGENT = [UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT];

/**
 * Practice-level configuration — provider availability & recurring blocks
 * (admin-on-behalf-of-provider), client tag definitions. No
 * SCHEDULING_AGENT (agents don't configure practice-level settings); no
 * PROVIDER (providers manage their own availability/blocks via
 * PROVIDER_ONLY self-service routes instead, not this admin path).
 */
export const PRACTICE_MANAGEMENT = [UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER];

/**
 * The three "office" roles that run day-to-day scheduling — patient
 * search/create/attempts, tickets inbox, agent dashboard + its
 * callbacks/cancellations/waitlist/stats, provider booking + log-attempt +
 * fill-candidates + schedule lookup. Excludes PROVIDER — providers don't do
 * office scheduling work, they get PROVIDER_ONLY routes for their own data.
 */
export const OFFICE_STAFF = [UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER];

/**
 * Every logged-in staff role, no restriction — shared/read-mostly routes
 * (provider list, ticket create/reply/resolve, waitlist list).
 */
export const ALL_STAFF = [
  UserRole.ADMINISTRATOR,
  UserRole.SCHEDULING_AGENT,
  UserRole.PRACTICE_MANAGER,
  UserRole.PROVIDER,
];

/**
 * A provider's own client roster, plus the roles that can view one on a
 * provider's behalf. No SCHEDULING_AGENT — agents browse via general
 * patient search, they have no "my roster" concept.
 */
export const ROSTER_ACCESS = [UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER, UserRole.PROVIDER];

/**
 * Provider self-service only — a provider acting on their own record
 * (self/blocks, self/recurring-block, self/calendar-feed, their own
 * dashboard). Never combine with other roles here: admin-on-behalf-of-
 * provider paths stay on PRACTICE_MANAGEMENT/OFFICE_STAFF above — mixing
 * the two is exactly what caused the self/* route-shadowing bug fixed
 * separately (see providers.controller.ts route ordering).
 */
export const PROVIDER_ONLY = [UserRole.PROVIDER];
