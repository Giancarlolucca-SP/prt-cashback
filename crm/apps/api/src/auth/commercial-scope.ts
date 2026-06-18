// Single source of truth for commercial visibility scoping by role.
// Shared by the commercial Kanban (US01), the commercial agenda (US02) and the leads
// pipeline so the role lists do not diverge (review finding on S2-US02).
//
// Roles here see ALL commercial records of the store. Everyone else is scoped to their
// own records — via the relevant ownership field, which differs per entity
// (assignedUserId for leads/cards, responsibleUserId for appointments/interactions),
// so the field mapping stays local to each route while the role predicate is unified.

export const COMMERCIAL_FULL_VIEW_ROLES: ReadonlySet<string> = new Set(["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"]);

export function isCommercialFullView(role: string): boolean {
  return COMMERCIAL_FULL_VIEW_ROLES.has(role);
}
