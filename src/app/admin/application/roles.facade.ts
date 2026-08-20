import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  RolesHttpGateway,
} from '../adapters/out/http/roles-http.gateway';
import {
  RolesUserListItem,
  UserPermissionConfig,
} from './ports/roles-gateway';

// ── State shape ───────────────────────────────────────────────────────────────

export type RolesListStatus = 'loading' | 'content' | 'error';
export type RolesConfigStatus = 'idle' | 'loading' | 'saving' | 'revoking' | 'error';

export interface RolesState {
  listStatus: RolesListStatus;
  users: RolesUserListItem[];
  selectedUserId: string | null;
  selectedConfig: UserPermissionConfig | null;
  configStatus: RolesConfigStatus;
  hasUnsavedChanges: boolean;
  error: string | null;
  saveError: string | null;
  saveSuccess: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deep-equality comparison for two Sets. Uses size + membership, NOT reference. */
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// ── Facade ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class RolesFacade {

  // ── Core state signals ────────────────────────────────────────────────────

  private readonly _state = signal<RolesState>({
    listStatus: 'loading',
    users: [],
    selectedUserId: null,
    selectedConfig: null,
    configStatus: 'idle',
    hasUnsavedChanges: false,
    error: null,
    saveError: null,
    saveSuccess: false,
  });

  readonly state = this._state.asReadonly();

  // ── Filter signals ─────────────────────────────────────────────────────────

  private readonly _searchTerm = signal('');
  private readonly _roleFilter = signal('');
  private readonly _statusFilter = signal('');

  // ── Draft signals (pending unsaved changes) ────────────────────────────────

  private readonly _draftRole = signal<'ADMIN' | 'OPERADOR' | null>(null);
  private readonly _draftPermissions = signal<Set<string>>(new Set());

  // ── Computed ───────────────────────────────────────────────────────────────

  /** Filtered user list based on current search/role/status filters. */
  readonly filteredUsers = computed(() => {
    const users = this._state().users;
    const search = this._searchTerm().toLowerCase();
    const role = this._roleFilter();
    const status = this._statusFilter();

    return users.filter((u) => {
      const matchSearch =
        !search ||
        u.fullName.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        u.role.toLowerCase().includes(search);

      const matchRole = !role || u.role === role;

      const matchStatus =
        !status ||
        (status === 'Activo' && u.accountActive) ||
        (status === 'Inactivo' && !u.accountActive);

      return matchSearch && matchRole && matchStatus;
    });
  });

  readonly draftRole = this._draftRole.asReadonly();
  readonly draftPermissions = this._draftPermissions.asReadonly();

  /**
   * True when the draft role or permissions differ from the last persisted state.
   * Uses proper Set equality (not reference comparison).
   */
  readonly hasUnsavedChanges = computed(() => {
    const config = this._state().selectedConfig;
    if (!config) return false;
    const draftRole = this._draftRole();
    if (draftRole === null) return false;
    const roleChanged = draftRole !== config.role;
    const permsChanged = !setsEqual(
      this._draftPermissions(),
      new Set(config.grantedPermissions)
    );
    return roleChanged || permsChanged;
  });

  /** true when the currently selected user's account is active. */
  readonly selectedUserIsActive = computed(() => {
    const userId = this._state().selectedUserId;
    if (!userId) return false;
    const user = this._state().users.find((u) => u.id === userId);
    return user?.accountActive ?? false;
  });

  constructor(private readonly gateway: RolesHttpGateway) {
    // Load users on construction (FR-011)
    this.loadUsers();
  }

  // ── List management ───────────────────────────────────────────────────────

  /** Fetch all system users from the backend and auto-select the first. */
  loadUsers(): void {
    this._state.update((s) => ({ ...s, listStatus: 'loading', error: null }));
    firstValueFrom(this.gateway.listUsers()).then(
      (users) => {
        this._state.update((s) => ({
          ...s,
          listStatus: 'content',
          users,
          error: null,
        }));
        // Auto-select first user per FR-011
        if (users.length > 0 && !this._state().selectedUserId) {
          this.selectUser(users[0].id);
        }
      },
      (err: unknown) =>
        this._state.update((s) => ({
          ...s,
          listStatus: 'error',
          error: (err as Error)?.message ?? 'Error cargando usuarios',
        }))
    );
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  setSearchTerm(term: string): void {
    this._searchTerm.set(term);
  }

  setRoleFilter(role: string): void {
    this._roleFilter.set(role);
  }

  setStatusFilter(status: string): void {
    this._statusFilter.set(status);
  }

  // ── User selection ─────────────────────────────────────────────────────────

  /**
   * Select a user and load their role+permissions config.
   * If there are unsaved changes, the caller must prompt with confirm() BEFORE calling this.
   * FR-035: unsaved changes guard is handled in the component layer.
   */
  selectUser(userId: string): void {
    this._state.update((s) => ({
      ...s,
      selectedUserId: userId,
      configStatus: 'loading',
      saveError: null,
      saveSuccess: false,
    }));
    this._draftRole.set(null);
    this._draftPermissions.set(new Set());

    firstValueFrom(this.gateway.getUserConfig(userId)).then(
      (config) => {
        this._state.update((s) => ({
          ...s,
          selectedConfig: config,
          configStatus: 'idle',
        }));
        // Initialize draft from loaded config
        this._draftRole.set(config.role);
        this._draftPermissions.set(new Set(config.grantedPermissions));
      },
      (err: unknown) =>
        this._state.update((s) => ({
          ...s,
          configStatus: 'error',
          saveError: (err as Error)?.message ?? 'Error cargando configuracion del usuario',
        }))
    );
  }

  // ── Draft role + permissions ───────────────────────────────────────────────

  setDraftRole(role: 'ADMIN' | 'OPERADOR'): void {
    this._draftRole.set(role);
  }

  togglePermission(permissionId: string): void {
    this._draftPermissions.update((perms) => {
      const next = new Set(perms);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  }

  selectAllPermissions(): void {
    this._draftPermissions.set(
      new Set([
        'approve_tx', 'reverse_tx', 'manage_limits',
        'reset_passwords', 'view_audit', 'modify_api',
        'export_data', 'view_revenue', 'schedule_reports',
      ])
    );
  }

  // ── Save / Discard ─────────────────────────────────────────────────────────

  /**
   * Atomically save role + permissions to the backend (FR-032).
   * On success: updates selectedConfig + user badge in list (FR-033).
   */
  saveConfiguration(): void {
    const { selectedUserId } = this._state();
    const draftRole = this._draftRole();
    if (!selectedUserId || !draftRole) return;

    this._state.update((s) => ({
      ...s,
      configStatus: 'saving',
      saveError: null,
      saveSuccess: false,
    }));

    firstValueFrom(
      this.gateway.saveUserConfig(selectedUserId, {
        role: draftRole,
        grantedPermissions: [...this._draftPermissions()],
      })
    ).then(
      (config) => {
        // Update selected config and sync draft state
        this._state.update((s) => ({
          ...s,
          selectedConfig: config,
          configStatus: 'idle',
          saveSuccess: true,
          // Update role badge in the user list if role changed (FR-033)
          users: s.users.map((u) =>
            u.id === selectedUserId ? { ...u, role: config.role } : u
          ),
        }));
        this._draftRole.set(config.role);
        this._draftPermissions.set(new Set(config.grantedPermissions));
      },
      (err: unknown) => {
        const message = (err as { error?: { message?: string } })?.error?.message
          ?? (err as Error)?.message
          ?? 'Error guardando configuracion';
        this._state.update((s) => ({
          ...s,
          configStatus: 'error',
          saveError: message,
        }));
      }
    );
  }

  /**
   * Discard pending changes — restore draft to last persisted config (FR-034).
   * No network call.
   */
  discardChanges(): void {
    const config = this._state().selectedConfig;
    if (!config) return;
    this._draftRole.set(config.role);
    this._draftPermissions.set(new Set(config.grantedPermissions));
    this._state.update((s) => ({
      ...s,
      saveError: null,
      saveSuccess: false,
    }));
  }

  // ── Revoke access ──────────────────────────────────────────────────────────

  /**
   * Permanently deactivate the selected user's account (FR-039).
   * On success: marks user as inactive in the list (FR-040).
   * The right panel remains showing the revoked user (FR-043).
   */
  revokeAccess(): void {
    const { selectedUserId } = this._state();
    if (!selectedUserId) return;

    this._state.update((s) => ({
      ...s,
      configStatus: 'revoking',
      saveError: null,
      saveSuccess: false,
    }));

    firstValueFrom(this.gateway.revokeAccess(selectedUserId)).then(
      (res) => {
        // Update user in list: accountActive=false, hasActiveSession=false (FR-040)
        this._state.update((s) => ({
          ...s,
          configStatus: 'idle',
          users: s.users.map((u) =>
            u.id === selectedUserId
              ? { ...u, accountActive: false, hasActiveSession: false }
              : u
          ),
          // Keep right panel showing the revoked user (FR-043)
        }));
      },
      (err: unknown) => {
        const raw = err as { status?: number; error?: { message?: string } };
        const message =
          raw?.status === 409
            ? (raw.error?.message ?? 'No puede revocar su propio acceso.')
            : ((err as Error)?.message ?? 'Error revocando acceso');
        this._state.update((s) => ({
          ...s,
          configStatus: 'error',
          saveError: message,
        }));
      }
    );
  }
}
