import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  trigger,
  style,
  animate,
  transition,
} from '@angular/animations';

import { UsersFacade } from './application/users.facade';
import {
  UserResponse,
  UserStatus,
  UserRole,
} from './application/ports/users-gateway';
import { AgentsHttpGateway } from './adapters/out/http/agents-http.gateway';
import { UsersHttpGateway } from './adapters/out/http/users-http.gateway';
import { AgentResponse } from './application/ports/agents-gateway';
import { AuthFacade } from '../auth/application/auth.facade';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, A11yModule],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideInPanel', [
      transition(':enter', [
        style({ transform: 'translateX(100%)' }),
        animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(0)' })),
      ]),
      transition(':leave', [
        animate('250ms cubic-bezier(0.4, 0, 0.6, 1)', style({ transform: 'translateX(100%)' })),
      ]),
    ]),
    trigger('fadeBackdrop', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('250ms ease', style({ opacity: 1 })),
      ]),
      transition(':leave', [
        animate('200ms ease', style({ opacity: 0 })),
      ]),
    ]),
  ],
})
export class UsersPageComponent implements OnInit, OnDestroy {

  constructor(
    readonly facade: UsersFacade,
    private readonly agentsGateway: AgentsHttpGateway,
    private readonly usersGateway: UsersHttpGateway,
    private readonly authFacade: AuthFacade,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  /** True when the admin is editing their own account (spec 016, FR-002, BR-002). */
  get isEditingOwnAccount(): boolean {
    return (this.editForm.email?.toLowerCase() ?? '') ===
           (this.authFacade.currentUser()?.email?.toLowerCase() ?? '_no_match_');
  }

  // ── Agent dropdown ─────────────────────────────────────────────────────────

  agents = signal<AgentResponse[]>([]);

  // ── Pending filter state (applied only when FILTRAR is clicked) ────────────

  /** Local draft values — not sent to the facade until applyAllFilters() */
  pendingAgentId = '';
  pendingStatus  = '';

  // ── Autocomplete state ─────────────────────────────────────────────────────

  searchInputValue = '';
  showAutocompleteDropdown = false;

  // ── Row state ──────────────────────────────────────────────────────────────

  private readonly statusChangingIds = new Set<string>();

  isStatusChanging(op: UserResponse): boolean {
    return this.statusChangingIds.has(op.id);
  }

  // ── Detail panel data ──────────────────────────────────────────────────────

  detailOperator: UserResponse | null = null;

  // ── Forms ──────────────────────────────────────────────────────────────────

  // ── Reset password flow (spec 016) ────────────────────────────────────────
  isResetConfirming = false;
  isResettingPassword = false;
  resetPasswordError = '';
  resetTemporaryPassword = '';
  isShowingResetResult = false;
  isCopied = false;
  private copyTimeout: ReturnType<typeof setTimeout> | null = null;

  addForm = {
    fullName: '',
    email: '',
    dni: '',
    role: 'OPERADOR' as UserRole,
    agentId: '',
  };
  isSaving = false;
  addError = '';
  /** Success message shown after creating a user (dismissed after 6 seconds). */
  addSuccessMessage = '';
  private addSuccessTimeout: ReturnType<typeof setTimeout> | null = null;

  editForm = {
    fullName: '',
    email: '',
    role: 'OPERADOR' as UserRole,
    agentId: '',
    enabled: true,
  };
  editingOperatorId = '';
  isSavingEdit = false;
  editError = '';

  // ── Computed helpers ───────────────────────────────────────────────────────

  readonly totalPages = this.facade.totalPages;

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.facade.state().currentPage;
    const maxButtons = 5;
    const half = Math.floor(maxButtons / 2);
    let start = Math.max(1, current - half);
    const end = Math.min(total, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    firstValueFrom(this.agentsGateway.listAgents()).then(
      (agents) => { this.agents.set(agents); this.cdr.markForCheck(); },
      () => this.agents.set([]),
    );
  }

  ngOnDestroy(): void {}

  // ── Filter handlers ────────────────────────────────────────────────────────

  onSearchInput(value: string): void {
    this.searchInputValue = value;
    if (value.trim().length > 0) {
      // Show autocomplete suggestions while typing, but do NOT apply filters yet
      this.showAutocompleteDropdown = true;
      this.facade.searchAutocomplete(value.trim());
    } else {
      this.showAutocompleteDropdown = false;
      this.facade.clearAutocomplete();
    }
  }

  onAutocompleteSelect(item: { fullName: string; dni: string }): void {
    // Selecting a suggestion only fills the input — does NOT trigger a fetch
    this.searchInputValue = item.fullName;
    this.showAutocompleteDropdown = false;
    this.facade.clearAutocomplete();
  }

  onSearchBlur(): void {
    setTimeout(() => {
      this.showAutocompleteDropdown = false;
      this.cdr.markForCheck();
    }, 200);
  }

  onAgentFilterChange(agentId: string): void {
    // Only update local draft — fetch happens when FILTRAR is clicked
    this.pendingAgentId = agentId;
  }

  onStatusFilterChange(status: string): void {
    // Only update local draft — fetch happens when FILTRAR is clicked
    this.pendingStatus = status;
  }

  /** LIMPIAR — resets all pending inputs and clears the applied filters. */
  clearAllFilters(): void {
    this.searchInputValue = '';
    this.pendingAgentId   = '';
    this.pendingStatus    = '';
    this.showAutocompleteDropdown = false;
    this.facade.clearAutocomplete();
    this.facade.applyFilters({ q: null, agentId: null, status: null });
  }

  /** FILTRAR — pushes all pending draft values to the facade and fetches. */
  applyAllFilters(): void {
    this.facade.applyFilters({
      q:       this.searchInputValue.trim() || null,
      agentId: this.pendingAgentId || null,
      status:  (this.pendingStatus as UserStatus) || null,
    });
  }

  // ── Pagination ─────────────────────────────────────────────────────────────

  goToPage(page: number): void {
    this.facade.goToPage(page);
  }

  // ── Panel management ───────────────────────────────────────────────────────

  onAddRoleChange(role: string): void {
    if (role === 'ADMIN') {
      this.addForm.agentId = '';
    }
  }

  onEditRoleChange(role: string): void {
    if (role === 'ADMIN') {
      this.editForm.agentId = '';
    }
  }

  openAddPanel(): void {
    this.addForm = { fullName: '', email: '', dni: '', role: 'OPERADOR', agentId: '' };
    this.isSaving = false;
    this.addError = '';
    this.facade.openPanel('add');
  }

  closeAddPanel(): void {
    this.facade.closePanel();
  }

  openEditPanel(op: UserResponse): void {
    this.editingOperatorId = op.id;
    this.editForm = {
      fullName: op.fullName,
      email: op.email,
      role: op.role as UserRole,
      agentId: op.agentId ?? '',
      enabled: op.enabled,
    };
    this.isSavingEdit = false;
    this.editError = '';
    // T018 / FR-009b / AC-008: reset all reset-password state so stale modal
    // from a previous user's edit session cannot leak (spec 016, Phase 6)
    this.isResetConfirming = false;
    this.isResettingPassword = false;
    this.isShowingResetResult = false;
    this.resetTemporaryPassword = '';
    this.resetPasswordError = '';
    this.isCopied = false;
    if (this.copyTimeout) { clearTimeout(this.copyTimeout); this.copyTimeout = null; }
    this.facade.openPanel('edit');
  }

  closeEditPanel(): void {
    // T018 / FR-009b: clear reset state on panel close so no stale password persists
    this.isResetConfirming = false;
    this.isResettingPassword = false;
    this.isShowingResetResult = false;
    this.resetTemporaryPassword = '';
    this.resetPasswordError = '';
    this.isCopied = false;
    if (this.copyTimeout) { clearTimeout(this.copyTimeout); this.copyTimeout = null; }
    this.facade.closePanel();
  }

  openDetailPanel(op: UserResponse): void {
    this.detailOperator = null;
    this.facade.openPanel('detail');
    firstValueFrom(this.facade.getOperator(op.id)).then(
      (detail) => { this.detailOperator = detail; this.cdr.markForCheck(); },
      () => { this.detailOperator = null; this.cdr.markForCheck(); },
    );
  }

  closeDetailPanel(): void {
    this.facade.closePanel();
    this.detailOperator = null;
  }

  // ── Reset password handlers ────────────────────────────────────────────────

  openResetConfirm(): void {
    this.isResetConfirming = true;
    this.resetPasswordError = '';
    this.cdr.markForCheck();
  }

  cancelReset(): void {
    this.isResetConfirming = false;
    this.resetPasswordError = '';
    this.cdr.markForCheck();
  }

  confirmReset(): void {
    this.isResettingPassword = true;
    this.resetPasswordError = '';
    firstValueFrom(this.usersGateway.resetPassword(this.editingOperatorId)).then(
      (res) => {
        this.isResettingPassword = false;
        this.isResetConfirming = false;
        this.resetTemporaryPassword = res.temporaryPassword;
        this.isShowingResetResult = true;
        this.cdr.markForCheck();
      },
      (err: unknown) => {
        this.isResettingPassword = false;
        this.resetPasswordError = this.extractErrorMessage(err, 'Error al restaurar la contraseña');
        this.cdr.markForCheck();
      },
    );
  }

  closeResetResult(): void {
    this.isShowingResetResult = false;
    this.resetTemporaryPassword = '';  // clear from memory (FR-009b / FR-013)
    this.isCopied = false;
    if (this.copyTimeout) clearTimeout(this.copyTimeout);
    this.cdr.markForCheck();
  }

  async copyTempPassword(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.resetTemporaryPassword);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = this.resetTemporaryPassword;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    this.isCopied = true;
    this.cdr.markForCheck();
    if (this.copyTimeout) clearTimeout(this.copyTimeout);
    this.copyTimeout = setTimeout(() => {
      this.isCopied = false;
      this.cdr.markForCheck();
    }, 2000);
  }

  // ── Add panel save ─────────────────────────────────────────────────────────

  saveNewOperator(): void {
    const f = this.addForm;
    if (!f.fullName.trim() || !f.email.trim() || !f.dni.trim()) return;
    this.isSaving = true;
    this.addError = '';
    const email = f.email.trim();
    firstValueFrom(
      this.facade.createOperator({
        fullName: f.fullName.trim(),
        email,
        dni: f.dni.trim(),
        role: f.role,
        agentId: f.agentId || null,
      }),
    ).then(
      () => {
        this.isSaving = false;
        this.facade.closePanel();
        this.facade.reload();
        // Show success notification with email hint (spec 015, FR-014)
        this.showAddSuccess(
          `Usuario creado exitosamente. Se envió el correo de bienvenida con las ` +
          `credenciales temporales a ${email}. El usuario deberá cambiar su contraseña ` +
          `al iniciar sesión por primera vez.`
        );
        this.cdr.markForCheck();
      },
      (err: unknown) => {
        this.isSaving = false;
        this.addError = this.extractErrorMessage(err, 'Error al registrar usuario');
        this.cdr.markForCheck();
      },
    );
  }

  private showAddSuccess(message: string): void {
    if (this.addSuccessTimeout) clearTimeout(this.addSuccessTimeout);
    this.addSuccessMessage = message;
    this.cdr.markForCheck();
    this.addSuccessTimeout = setTimeout(() => {
      this.addSuccessMessage = '';
      this.cdr.markForCheck();
    }, 8000);
  }

  // ── Edit panel save ────────────────────────────────────────────────────────

  saveEditOperator(): void {
    const f = this.editForm;
    if (!f.fullName.trim() || !f.email.trim()) return;
    this.isSavingEdit = true;
    this.editError = '';
    firstValueFrom(
      this.facade.updateOperator(this.editingOperatorId, {
        fullName: f.fullName.trim(),
        email: f.email.trim(),
        role: f.role,
        agentId: f.agentId || null,
        enabled: f.enabled,
      }),
    ).then(
      () => {
        this.isSavingEdit = false;
        this.facade.closePanel();
        this.facade.reload();
        this.cdr.markForCheck();
      },
      (err: unknown) => {
        this.isSavingEdit = false;
        this.editError = this.extractErrorMessage(err, 'Error al guardar cambios');
        this.cdr.markForCheck();
      },
    );
  }

  // ── Error message extraction ───────────────────────────────────────────────

  /**
   * Extracts a user-friendly error message from an HttpErrorResponse.
   * Maps known backend error codes (duplicate_dni, duplicate_email, etc.)
   * to Spanish messages. Falls back to the backend detail or a generic message.
   */
  private extractErrorMessage(err: unknown, fallback: string): string {
    if (!(err instanceof HttpErrorResponse)) return fallback;

    // ── NEW: Map structured errorCode responses (spec 015 pattern) ──────────
    // Backend returns { errorCode: "...", message: "..." }
    const structuredErrorCodeMessages: Record<string, string> = {
      EMAIL_ALREADY_REGISTERED:
        'El correo electrónico ingresado ya está registrado en el sistema. ' +
        'Verifique el correo o utilice uno diferente.',
      CREDENTIAL_DELIVERY_FAILED:
        'El usuario fue creado en el sistema, pero no se pudo enviar el correo de bienvenida. ' +
        'Elimine el usuario y vuelva a crearlo para que reciba sus credenciales.',
    };

    const errorCode = err.error?.errorCode as string | undefined;
    if (errorCode && structuredErrorCodeMessages[errorCode]) {
      return structuredErrorCodeMessages[errorCode];
    }

    // If errorCode is present but not mapped, use the backend message directly
    if (errorCode && err.error?.message && typeof err.error.message === 'string') {
      return err.error.message;
    }

    // ── LEGACY: Map older error formats ──────────────────────────────────────

    // Map specific error codes to user-friendly Spanish messages
    const errorCodeMessages: Record<string, string> = {
      duplicate_dni:   'Ya existe un usuario con este DNI.',
      duplicate_email: 'Ya existe un usuario con este correo electrónico.',
      invalid_dni:     'El DNI ingresado no es válido.',
      invalid_email:   'El correo electrónico no es válido.',
      weak_password:   'La contraseña no cumple los requisitos de seguridad.',
    };

    // Check errors array first (most specific)
    const errors: Array<{ code?: string; detail?: string }> =
      err.error?.errors ?? [];
    for (const e of errors) {
      if (e.code && errorCodeMessages[e.code]) {
        return errorCodeMessages[e.code];
      }
    }

    // Fall back to the problem detail field
    if (err.error?.detail && typeof err.error.detail === 'string') {
      // Translate common English backend messages
      const detailMap: Record<string, string> = {
        'A user with this DNI already exists.':
          'Ya existe un usuario con este DNI.',
        'A user with this email already exists.':
          'Ya existe un usuario con este correo electrónico.',
        'Email already in use.':
          'Ya existe un usuario con este correo electrónico.',
      };
      return detailMap[err.error.detail] ?? err.error.detail;
    }

    // Use title as last resort before generic fallback
    if (err.error?.title && typeof err.error.title === 'string') {
      return err.error.title;
    }

    return fallback;
  }

  // ── Row status change ──────────────────────────────────────────────────────

  blockOperator(op: UserResponse): void {
    if (this.statusChangingIds.has(op.id)) return;
    this.statusChangingIds.add(op.id);
    this.cdr.markForCheck();
    firstValueFrom(this.facade.changeStatus(op.id, { status: 'INACTIVO' })).then(
      () => {
        this.statusChangingIds.delete(op.id);
        this.facade.reload();
        this.cdr.markForCheck();
      },
      () => {
        this.statusChangingIds.delete(op.id);
        this.cdr.markForCheck();
      },
    );
  }

  unblockOperator(op: UserResponse): void {
    if (this.statusChangingIds.has(op.id)) return;
    this.statusChangingIds.add(op.id);
    this.cdr.markForCheck();
    firstValueFrom(this.facade.changeStatus(op.id, { status: 'ACTIVO' })).then(
      () => {
        this.statusChangingIds.delete(op.id);
        this.facade.reload();
        this.cdr.markForCheck();
      },
      () => {
        this.statusChangingIds.delete(op.id);
        this.cdr.markForCheck();
      },
    );
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  statusLabel(status: UserStatus): string {
    return status === 'ACTIVO' ? 'Activo' : 'Inactivo';
  }

  roleLabel(role: string): string {
    const map: Record<string, string> = {
      ADMIN:    'Administrador',
      OPERADOR: 'Operador',
    };
    return map[role] ?? role;
  }

  formatConnectionDate(isoString: string | null): string {
    if (!isoString) return '—';
    const d = new Date(isoString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    if (dateOnly.getTime() === today.getTime()) return `Hoy, ${time}`;
    if (dateOnly.getTime() === yesterday.getTime()) return `Ayer, ${time}`;
    const diff = Math.floor((today.getTime() - dateOnly.getTime()) / 86400000);
    return `Hace ${diff} días`;
  }
}
