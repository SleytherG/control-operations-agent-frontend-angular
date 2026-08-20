import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuditFacade } from './application/audit.facade';
import { AuditSessionStatus, AuditUserRole } from './application/ports/audit-gateway';

/**
 * Audit Sessions Page Component.
 * All data originates from the backend via AuditFacade — no hardcoded records (FR-001/SC-001).
 * Filters auto-apply on change (homologated with users-page / operation-types-page pattern).
 */
@Component({
  selector: 'app-audit-sessions-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './audit-sessions-page.component.html',
  styleUrl: './audit-sessions-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditSessionsPageComponent implements OnInit {

  /** Angular Material date range FormGroup for the DESDE–HASTA date filter. */
  readonly dateRangeGroup = new FormGroup({
    dateFrom: new FormControl<Date | null>(null),
    dateTo:   new FormControl<Date | null>(null),
  });

  /** Bound values for the native select elements — reset visually on Limpiar */
  pendingRoleValue   = '';
  pendingStatusValue = '';
  pendingDeviceValue = '';

  /**
   * Staged filter values — only applied when FILTRAR is clicked.
   * All handlers update this object; the facade is NOT called until onFiltrar().
   */
  private pendingFilter = {
    dateFrom: '',
    dateTo:   '',
    role:     null as string | null,
    status:   null as string | null,
    device:   null as string | null,
  };

  constructor(readonly facade: AuditFacade) {}

  ngOnInit(): void {
    // Sync Material date range picker values to pendingFilter (no immediate apply)
    this.dateRangeGroup.controls.dateFrom.valueChanges.subscribe(date => {
      this.pendingFilter.dateFrom = date ? this.toIso(date) : '';
    });
    this.dateRangeGroup.controls.dateTo.valueChanges.subscribe(date => {
      this.pendingFilter.dateTo = date ? this.toIso(date) : '';
    });
  }

  /** Formats a Date to YYYY-MM-DD for the facade. */
  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Formats a Date for display as "DD/MM/YY". */
  formatDateDisplay(date: Date | null): string {
    if (!date) return '';
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = String(date.getFullYear()).slice(-2);
    return `${d}/${m}/${y}`;
  }

  /** Display value for the date range trigger input. */
  get dateRangeDisplay(): string {
    const start = this.dateRangeGroup.controls.dateFrom.value;
    const end   = this.dateRangeGroup.controls.dateTo.value;
    if (!start && !end) return '';
    return `${start ? this.formatDateDisplay(start) : '...'} - ${end ? this.formatDateDisplay(end) : '...'}`;
  }

  // ── Convenience accessors for template ─────────────────────────────────────

  get state() { return this.facade.state(); }
  get totalPages() { return this.facade.totalPages(); }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const current = this.state.currentPage;
    const pages = new Set<number>([1, total]);
    for (let i = Math.max(1, current - 1); i <= Math.min(total, current + 1); i++) {
      pages.add(i);
    }
    return Array.from(pages).sort((a, b) => a - b);
  }

  get showingText(): string {
    const s = this.state;
    if (s.totalElements === 0) return 'Mostrando 0 de 0 registros';
    const from = (s.currentPage - 1) * s.pageSize + 1;
    const to   = Math.min(s.currentPage * s.pageSize, s.totalElements);
    return `Mostrando ${from}–${to} de ${s.totalElements} registros`;
  }

  // ── Filter control handlers — stage values; apply only on FILTRAR click ─────

  onDateFromChange(value: string): void {
    this.pendingFilter.dateFrom = value;
  }

  onDateToChange(value: string): void {
    this.pendingFilter.dateTo = value;
  }

  onRoleChange(value: string): void {
    this.pendingFilter.role = value || null;
  }

  onStatusChange(value: string): void {
    this.pendingFilter.status = value || null;
  }

  onDeviceChange(value: string): void {
    this.pendingFilter.device = value || null;
  }

  /** Applies all staged filters to the facade (called by FILTRAR button). */
  onFiltrar(): void {
    this.facade.applyFilter({
      dateFrom: this.pendingFilter.dateFrom,
      dateTo:   this.pendingFilter.dateTo,
      role:     this.pendingFilter.role as AuditUserRole | null,
      status:   this.pendingFilter.status as AuditSessionStatus | null,
      device:   this.pendingFilter.device,
    });
  }

  /** Resets all staged filters and reloads data. */
  onLimpiar(): void {
    this.pendingFilter = { dateFrom: '', dateTo: '', role: null, status: null, device: null };
    this.pendingRoleValue   = '';
    this.pendingStatusValue = '';
    this.pendingDeviceValue = '';
    this.dateRangeGroup.reset({ dateFrom: null, dateTo: null });
    this.facade.applyFilter({ dateFrom: '', dateTo: '', role: null, status: null, device: null });
  }

  // ── Pagination ──────────────────────────────────────────────────────────────

  goToPage(page: number): void {
    this.facade.goToPage(page);
  }

  // ── CSV Export ──────────────────────────────────────────────────────────────

  exportCsv(): void {
    this.facade.exportCsv();
  }

  // ── Display helpers ─────────────────────────────────────────────────────────

  statusLabel(status: AuditSessionStatus): string {
    const map: Record<AuditSessionStatus, string> = {
      ACTIVA:   'Activa',
      EXITOSA:  'Renovada',
      CERRADA:  'Cerrada',
      EXPIRADA: 'Expirada',
      FALLIDA:  'Fallida',
    };
    return map[status] ?? status;
  }

  isAdminRole(role: AuditUserRole): boolean {
    return role === 'ADMIN';
  }

  initials(displayName: string, email: string): string {
    const parts = (displayName || email).trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (displayName || email).slice(0, 2).toUpperCase();
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }
}
