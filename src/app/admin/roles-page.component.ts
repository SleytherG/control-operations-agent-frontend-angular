import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RolesFacade } from './application/roles.facade';
import { RolesUserListItem } from './application/ports/roles-gateway';

/** Fixed permission catalog — display metadata is stored here, not in the backend. */
export interface PermissionItem {
  id: string;
  label: string;
  description: string;
  category: 'OPERACIONES' | 'SEGURIDAD' | 'REPORTES';
}

export const PERMISSION_CATALOG: PermissionItem[] = [
  // OPERACIONES
  { id: 'approve_tx',    category: 'OPERACIONES', label: 'Aprobar Transacciones',         description: 'Permitir la ejecucion de transferencias de fondos pendientes.' },
  { id: 'reverse_tx',   category: 'OPERACIONES', label: 'Revertir Transacciones',         description: 'Capacidad de anular transacciones liquidadas en 24 horas.' },
  { id: 'manage_limits',category: 'OPERACIONES', label: 'Gestionar Limites de Liquidacion', description: 'Ajustar limites de volumen diario para cuentas de agentes.' },
  // SEGURIDAD
  { id: 'reset_passwords', category: 'SEGURIDAD', label: 'Restablecer Contrasenas',       description: 'Forzar restablecimiento de credenciales en cuentas subordinadas.' },
  { id: 'view_audit',    category: 'SEGURIDAD', label: 'Ver Registros de Auditoria',       description: 'Acceso de solo lectura a registros del sistema.' },
  { id: 'modify_api',    category: 'SEGURIDAD', label: 'Modificar Claves API',             description: 'Generar o revocar tokens de integracion.' },
  // REPORTES
  { id: 'export_data',   category: 'REPORTES', label: 'Exportar Datos Financieros',        description: 'Descargar CSV/Excel de datos brutos de transacciones.' },
  { id: 'view_revenue',  category: 'REPORTES', label: 'Ver Dashboards de Ingresos',        description: 'Acceso a metricas de margen bruto de nivel superior.' },
  { id: 'schedule_reports', category: 'REPORTES', label: 'Programar Reportes Automaticos', description: 'Configurar entrega por email de resumenes semanales.' },
];

export const PERMISSIONS_BY_CATEGORY = {
  OPERACIONES: PERMISSION_CATALOG.filter(p => p.category === 'OPERACIONES'),
  SEGURIDAD:   PERMISSION_CATALOG.filter(p => p.category === 'SEGURIDAD'),
  REPORTES:    PERMISSION_CATALOG.filter(p => p.category === 'REPORTES'),
};

@Component({
  selector: 'app-roles-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './roles-page.component.html',
  styleUrl: './roles-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesPageComponent implements OnInit {

  readonly permissionsByCategory = PERMISSIONS_BY_CATEGORY;

  /** Controls mobile panel view: false = user list, true = config panel */
  readonly showConfigPanel = signal(false);

  constructor(readonly facade: RolesFacade) {}

  ngOnInit(): void {
    // Always reload the user list when the page is opened so that session
    // indicators (green/grey dots) reflect the current database state.
    // The facade is a root singleton — without this, stale cached data from a
    // previous session would persist across login/logout cycles until hard refresh.
    this.facade.loadUsers();
  }

  // ── User list ──────────────────────────────────────────────────────────────

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.facade.setSearchTerm(value);
  }

  onRoleFilterChange(role: string): void {
    this.facade.setRoleFilter(role);
  }

  onStatusFilterChange(status: string): void {
    this.facade.setStatusFilter(status);
  }

  selectUser(user: RolesUserListItem): void {
    const currentId = this.facade.state().selectedUserId;
    if (currentId === user.id) {
      // Already selected — on mobile, still switch to config view
      this.showConfigPanel.set(true);
      return;
    }

    // FR-035: unsaved changes guard
    if (this.facade.hasUnsavedChanges()) {
      const confirmed = confirm(
        'Tiene cambios sin guardar. Si cambia de usuario, perdera los cambios. Continuar?'
      );
      if (!confirmed) return;
    }
    this.facade.selectUser(user.id);
    // On mobile: switch to config panel after selecting a user
    this.showConfigPanel.set(true);
  }

  /** Return to the user list on mobile (back button) */
  goBackToList(): void {
    this.showConfigPanel.set(false);
  }

  // ── Role cards ─────────────────────────────────────────────────────────────

  onRoleCardClick(role: 'ADMIN' | 'OPERADOR'): void {
    this.facade.setDraftRole(role);
  }

  // ── Permissions ────────────────────────────────────────────────────────────

  isPermissionGranted(permissionId: string): boolean {
    return this.facade.draftPermissions().has(permissionId);
  }

  onPermissionToggle(permissionId: string): void {
    this.facade.togglePermission(permissionId);
  }

  onSelectAll(): void {
    this.facade.selectAllPermissions();
  }

  // ── Save / Discard ─────────────────────────────────────────────────────────

  onSaveConfiguration(): void {
    this.facade.saveConfiguration();
  }

  onDiscardChanges(): void {
    this.facade.discardChanges();
  }

  // ── Revoke access ──────────────────────────────────────────────────────────

  onRevokeAccess(): void {
    const state = this.facade.state();
    const user = state.users.find(u => u.id === state.selectedUserId);
    if (!user) return;

    // FR-038: explicit confirmation dialog with user's name
    const confirmed = confirm(
      `Esta seguro de que desea revocar el acceso de "${user.fullName}"?\n\n` +
      'Esta accion desactivara la cuenta de forma permanente. ' +
      'El usuario no podra iniciar sesion hasta que un administrador reactive la cuenta.'
    );
    if (confirmed) {
      this.facade.revokeAccess();
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  get selectedUser(): RolesUserListItem | undefined {
    const state = this.facade.state();
    return state.users.find(u => u.id === state.selectedUserId);
  }
}
