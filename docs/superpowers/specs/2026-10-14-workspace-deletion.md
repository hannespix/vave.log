# Owner workspace deletion

Owners can permanently delete individual studios and demo workspaces, including archived demos. Settings opens one localized management dialog with all workspaces the signed-in real user currently owns; archived-only accounts can reach it from onboarding/unavailable workspace screens. Active managers/members do not gain owner actions.

A preview shows the exact name, status, record counts and running timers. Deletion requires the unchanged exact name and an explicit irreversible-data confirmation. Running timers block deletion. All business records in the selected workspace disappear atomically; login accounts and other workspaces remain. Failed requests preserve the current context and require refreshing stale previews where relevant. Successful deletion selects a remaining accessible workspace or onboarding, clearing the deleted route.

The shared user-scoped service exposes list_owned_workspaces and delete_workspace to GUI and MCP. Database authorization verifies current real owner membership, including transferred owners and archived demos. A private transaction/workspace/actor capability permits only deletion-specific exceptions to immutable-invoice, approved-time and last-owner guards. Ordinary inserts/updates/deletes retain existing protection; no client-controllable session flag or trigger disabling. Timer starts and deletion serialize on the workspace row.

Verification: role and exact-name tests; complete-data/account-isolation checks; rollback on partial failure; normal time/invoice regression suite; synthetic live SQL transaction rolled back; desktop/mobile browser flow in CI; independent security review. Existing user workspaces are never deleted during implementation.
