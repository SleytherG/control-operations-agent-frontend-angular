import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  trigger,
  style,
  animate,
  transition,
} from '@angular/animations';
import { OperationTypesFacade } from './application/operation-types.facade';
import { OperationTypesHttpGateway } from './adapters/out/http/operation-types-http.gateway';
import { OperationTypeResponse } from './application/ports/operation-types-gateway';

@Component({
  selector: 'app-operation-types-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  templateUrl: './operation-types-page.component.html',
  styleUrl: './operation-types-page.component.scss',
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
  providers: [OperationTypesFacade],
})
export class OperationTypesPageComponent implements OnInit {

  constructor(
    readonly facade: OperationTypesFacade,
    readonly gateway: OperationTypesHttpGateway,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  // ── Facade state (exposed to template) ───────────────────────────────────────

  readonly state = this.facade.state;
  readonly autocomplete = this.facade.autocomplete;
  readonly totalPages = this.facade.totalPages;

  // ── Categories (loaded from backend — FR-006) ─────────────────────────────────

  readonly categories = signal<string[]>([]);

  // ── Search input state (custom dropdown — matches /users design) ──────────────

  /** Raw value shown in the search input field */
  searchInputValue = '';

  /** Whether the search autocomplete dropdown is visible */
  showSearchDropdown = false;

  /** Staged filter values — only applied when FILTRAR is clicked. */
  private pendingFilter = {
    q:        null as string | null,
    category: null as string | null,
    status:   null as 'ACTIVO' | 'INACTIVO' | null,
  };

  // ── Category dropdown visibility (for add and edit panels) ───────────────────

  showAddCategoryDropdown = false;
  showEditCategoryDropdown = false;

  /** Returns categories filtered by the current query string. Shows all if query is empty. */
  getCategoryItems(query: string): string[] {
    const cats = this.categories();
    if (!query || !query.trim()) return cats;
    return cats.filter(c => c.toLowerCase().includes(query.toLowerCase()));
  }

  onAddCategoryInput(): void {
    this.showAddCategoryDropdown = true;
    this.cdr.markForCheck();
  }

  onAddCategoryBlur(): void {
    setTimeout(() => { this.showAddCategoryDropdown = false; this.cdr.markForCheck(); }, 200);
  }

  onAddCategorySelect(cat: string): void {
    this.addForm.category = cat;
    this.showAddCategoryDropdown = false;
    this.cdr.markForCheck();
  }

  onEditCategoryInput(): void {
    this.showEditCategoryDropdown = true;
    this.cdr.markForCheck();
  }

  onEditCategoryBlur(): void {
    setTimeout(() => { this.showEditCategoryDropdown = false; this.cdr.markForCheck(); }, 200);
  }

  onEditCategorySelect(cat: string): void {
    this.editForm.category = cat;
    this.showEditCategoryDropdown = false;
    this.cdr.markForCheck();
  }

  onAddFlowChange(value: string): void {
    this.addForm.flow = value as 'INGRESO' | 'EGRESO';
    this.cdr.markForCheck();
  }

  onEditFlowChange(value: string): void {
    this.editForm.flow = value as 'INGRESO' | 'EGRESO';
    this.cdr.markForCheck();
  }

  // ── In-flight save flags (FR-022) ─────────────────────────────────────────────

  isSavingAdd = false;
  isSavingEdit = false;

  // ── Status-changing row IDs (FR-016) ──────────────────────────────────────────

  readonly statusChangingIds = new Set<string>();

  // ── Error messages ────────────────────────────────────────────────────────────

  addErrorMessage: string | null = null;
  editErrorMessage: string | null = null;
  rowErrorMessage: string | null = null;

  // ── Add form (name + category + flow — NO commission) ─────────────────────

  addForm = { name: '', category: '', flow: 'INGRESO' as 'INGRESO' | 'EGRESO' };

  // ── Edit form (name + category + flow + enabled — NO commission) ──────────

  editForm = { name: '', category: '', flow: 'INGRESO' as 'INGRESO' | 'EGRESO', enabled: true };

  // ── Computed page range for pagination footer ──────────────────────────────────

  readonly pageStart = computed(() =>
    this.state().totalElements === 0
      ? 0
      : (this.state().currentPage - 1) * this.state().pageSize + 1,
  );

  readonly pageEnd = computed(() =>
    Math.min(
      this.state().currentPage * this.state().pageSize,
      this.state().totalElements,
    ),
  );

  /** Array of page numbers for the pagination control. */
  readonly pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1),
  );

  /** Public reload alias for template use. */
  reload(): void {
    this.facade.reload();
    this.cdr.markForCheck();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadCategories();
  }

  // ── Custom search autocomplete handlers ───────────────────────────────────────

  onSearchInput(value: string): void {
    this.searchInputValue = value;
    this.showSearchDropdown = value.trim().length > 0;
    this.facade.searchAutocomplete(value.trim());
    this.cdr.markForCheck();
  }

  onSearchBlur(): void {
    // Delay so mousedown on dropdown item fires before blur hides the dropdown
    setTimeout(() => {
      this.showSearchDropdown = false;
      this.cdr.markForCheck();
    }, 150);
  }

  onSearchSelect(name: string): void {
    this.searchInputValue = name;
    this.pendingFilter.q = name;
    this.showSearchDropdown = false;
    this.facade.clearAutocomplete();
    this.cdr.markForCheck();
  }

  /** Reload categories from backend — called on init and after successful save (new categories may have been added). */
  private loadCategories(): void {
    firstValueFrom(this.gateway.getCategories())
      .then((cats) => {
        this.categories.set(cats);
        this.cdr.markForCheck();
      })
      .catch(() => this.categories.set([]));
  }

  // ── Pagination ────────────────────────────────────────────────────────────────

  goToPage(page: number): void {
    this.facade.goToPage(page);
    this.cdr.markForCheck();
  }

  // ── Search autocomplete (FR-004, FR-005) ──────────────────────────────────────

  // ── Staged filter handlers — only stored; applied on FILTRAR click ────────────

  onCategoryChange(value: string): void {
    this.pendingFilter.category = value || null;
    this.cdr.markForCheck();
  }

  onStatusChange(value: string): void {
    this.pendingFilter.status = (value || null) as ('ACTIVO' | 'INACTIVO' | null);
    this.cdr.markForCheck();
  }

  /** Applies all staged filters (called by FILTRAR button). */
  onFiltrar(): void {
    const q = this.pendingFilter.q ?? (this.searchInputValue.trim() ? this.searchInputValue.trim() : null);
    this.facade.applyFilters({ q, category: this.pendingFilter.category, status: this.pendingFilter.status });
    this.cdr.markForCheck();
  }

  /** Resets all staged filters and reloads (called by LIMPIAR button). */
  onLimpiar(): void {
    this.pendingFilter = { q: null, category: null, status: null };
    this.searchInputValue = '';
    this.showSearchDropdown = false;
    this.facade.clearAutocomplete();
    this.facade.applyFilters({ q: null, category: null, status: null });
    this.cdr.markForCheck();
  }

  // ── Add panel (US6) ───────────────────────────────────────────────────────────

  openAddPanel(): void {
    this.addForm = { name: '', category: '', flow: 'INGRESO' };
    this.addErrorMessage = null;
    this.isSavingAdd = false;
    this.facade.openPanel('add');
    this.cdr.markForCheck();
  }

  closeAddPanel(): void {
    this.facade.closePanel();
    this.cdr.markForCheck();
  }

  saveNewOperationType(): void {
    if (!this.addForm.name.trim() || !this.addForm.category) {
      this.addErrorMessage = 'Por favor complete todos los campos obligatorios.';
      this.cdr.markForCheck();
      return;
    }
    this.isSavingAdd = true;
    this.addErrorMessage = null;
    this.cdr.markForCheck();

    firstValueFrom(
      this.facade.createOperationType({ name: this.addForm.name.trim(), category: this.addForm.category, flow: this.addForm.flow }),
    ).then(
      () => {
        this.isSavingAdd = false;
        this.facade.closePanel();
        this.facade.reload();
        this.loadCategories(); // refresh categories in case a new one was created
        this.cdr.markForCheck();
      },
      (err: unknown) => {
        this.isSavingAdd = false;
        const detail = this.extractErrorDetail(err);
        this.addErrorMessage = detail ?? 'Error al registrar el tipo de operación. Intente nuevamente.';
        this.cdr.markForCheck();
      },
    );
  }

  // ── Edit panel (US7) ──────────────────────────────────────────────────────────

  openEditPanel(op: OperationTypeResponse): void {
    this.editForm = {
      name: op.name,
      category: op.category,
      flow: op.flow ?? 'INGRESO',
      enabled: op.status === 'ACTIVO',
    };
    this.editErrorMessage = null;
    this.isSavingEdit = false;
    this.facade.openPanel('edit', op);
    this.cdr.markForCheck();
  }

  closeEditPanel(): void {
    this.facade.closePanel();
    this.cdr.markForCheck();
  }

  saveEditOperationType(): void {
    const target = this.state().editTarget;
    if (!target) return;

    if (!this.editForm.name.trim() || !this.editForm.category) {
      this.editErrorMessage = 'Por favor complete todos los campos obligatorios.';
      this.cdr.markForCheck();
      return;
    }

    this.isSavingEdit = true;
    this.editErrorMessage = null;
    this.cdr.markForCheck();

    firstValueFrom(
      this.facade.updateOperationType(target.id, {
        name: this.editForm.name.trim(),
        category: this.editForm.category,
        flow: this.editForm.flow,
        enabled: this.editForm.enabled,
      }),
    ).then(
      () => {
        this.isSavingEdit = false;
        this.facade.closePanel();
        this.facade.reload();
        this.loadCategories(); // refresh categories in case the category was renamed to a new one
        this.cdr.markForCheck();
      },
      (err: unknown) => {
        this.isSavingEdit = false;
        // Revert enabled toggle if 409 FK constraint was violated
        const httpErr = err as { status?: number };
        if (httpErr?.status === 409) {
          this.editForm.enabled = target.status === 'ACTIVO';
        }
        const detail = this.extractErrorDetail(err);
        this.editErrorMessage = detail ?? 'Error al guardar los cambios. Intente nuevamente.';
        this.cdr.markForCheck();
      },
    );
  }

  // ── Row status toggle (US8) ───────────────────────────────────────────────────

  blockOperationType(op: OperationTypeResponse): void {
    this.toggleRowStatus(op, 'INACTIVO');
  }

  unblockOperationType(op: OperationTypeResponse): void {
    this.toggleRowStatus(op, 'ACTIVO');
  }

  private toggleRowStatus(op: OperationTypeResponse, targetStatus: 'ACTIVO' | 'INACTIVO'): void {
    this.statusChangingIds.add(op.id);
    this.rowErrorMessage = null;
    this.cdr.markForCheck();

    firstValueFrom(
      this.facade.changeStatus(op.id, { status: targetStatus }),
    ).then(
      () => {
        this.statusChangingIds.delete(op.id);
        // Reload to get fresh server state
        this.facade.reload();
        this.cdr.markForCheck();
      },
      (err: unknown) => {
        this.statusChangingIds.delete(op.id);
        const detail = this.extractErrorDetail(err);
        this.rowErrorMessage =
          detail ?? 'No se pudo cambiar el estado. Intente nuevamente.';
        this.cdr.markForCheck();
      },
    );
  }

  // ── Error extraction helper ───────────────────────────────────────────────────

  private extractErrorDetail(err: unknown): string | null {
    const e = err as { error?: { detail?: string; title?: string }; status?: number };
    return e?.error?.detail ?? e?.error?.title ?? null;
  }
}
