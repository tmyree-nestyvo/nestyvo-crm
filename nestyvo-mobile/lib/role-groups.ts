import type { UserRole } from './store';

// Mirrors nestyvo-api/src/auth/role-groups.ts — same group names, same
// meaning, kept in sync by hand since the two apps don't share a build.
// Read that file's header for why this exists: Charlene flagged (Aug 23,
// repeated Sep 24) that a fix lands on one role's screens but not
// another's because each screen hand-typed its own `role === '...'`
// check — this is the mobile-side half of centralizing that into one
// place per role combination.
//
// This file only NAMES today's existing behavior — it doesn't change what
// any screen shows to which role.

export const ADMIN_ONLY: UserRole[] = ['administrator'];
export const ADMIN_AND_AGENT: UserRole[] = ['administrator', 'scheduling_agent'];
export const PRACTICE_MANAGEMENT: UserRole[] = ['administrator', 'practice_manager'];
export const OFFICE_STAFF: UserRole[] = ['administrator', 'scheduling_agent', 'practice_manager'];
export const ALL_STAFF: UserRole[] = ['administrator', 'scheduling_agent', 'practice_manager', 'provider'];
export const ROSTER_ACCESS: UserRole[] = ['administrator', 'practice_manager', 'provider'];
export const PROVIDER_ONLY: UserRole[] = ['provider'];

/** `hasRole(role, PRACTICE_MANAGEMENT)` reads the same as the backend's `@Roles(...PRACTICE_MANAGEMENT)`. */
export function hasRole(role: UserRole | null | undefined, group: UserRole[]): boolean {
  return !!role && group.includes(role);
}
