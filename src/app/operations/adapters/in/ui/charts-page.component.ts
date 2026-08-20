import {
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Chart, ChartData, ChartOptions, registerables } from 'chart.js';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MatNativeDateModule } from '@angular/material/core';
import { AppDateAdapter } from '../../../../core/app-date-adapter';
import { ChartsFacade } from '../../../application/charts.facade';
import { OperationResponse } from '../../../domain/operation';

// Register all Chart.js components once at module level (no Angular linker involved)
Chart.register(...registerables);

// ─── Pure utility functions ───────────────────────────────────────────────────

/**
 * Converts an ISO datetime string to a YYYY-MM-DD string using the
 * local Lima timezone (America/Lima, UTC-5) as required by FR-002 and
 * the clarification session (Decision 10 in research.md).
 */
function toLocalDateString(isoString: string): string {
  const date = new Date(isoString);
  const parts = date
    .toLocaleDateString('es-PE', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return isoString.substring(0, 10);
}

/**
 * Groups ACTIVE operations by Lima local calendar date.
 * Returns Chart.js ChartData<'bar'> sorted ascending. (FR-002)
 */
export function groupByDate(ops: OperationResponse[]): ChartData<'bar'> {
  const counts = new Map<string, number>();
  for (const op of ops) {
    const date = toLocalDateString(op.registeredAt);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    labels: sorted.map(([date]) => date),
    datasets: [
      {
        label: 'Operaciones',
        data: sorted.map(([, count]) => count),
        backgroundColor: '#1565c0',
        borderColor: '#0d47a1',
        borderWidth: 1,
      },
    ],
  };
}

/**
 * Groups ACTIVE operations by type (DEPOSIT / WITHDRAWAL).
 * Returns Chart.js ChartData<'doughnut'>. (FR-003)
 */
export function groupByType(ops: OperationResponse[]): ChartData<'doughnut'> {
  const depositCount = ops.filter(op => op.type === 'DEPOSIT').length;
  const withdrawalCount = ops.filter(op => op.type === 'WITHDRAWAL').length;
  return {
    labels: ['Depósito', 'Retiro'],
    datasets: [
      {
        data: [depositCount, withdrawalCount],
        backgroundColor: ['#1565c0', '#e53935'],
        hoverBackgroundColor: ['#1976d2', '#ef5350'],
      },
    ],
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-charts-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: './charts-page.component.html',
  styleUrl: './charts-page.component.scss',
  providers: [
    // Override the NativeDateAdapter provided by MatNativeDateModule so the
    // datepicker inputs display dates as DD/MM/YYYY with leading-zero padding.
    { provide: DateAdapter, useClass: AppDateAdapter },
  ],
})
export class ChartsPageComponent implements OnDestroy, AfterViewInit {
  private readonly facade = inject(ChartsFacade);
  /**
   * Used to force a synchronous change-detection pass before accessing
   * @ViewChild canvas refs. The canvas elements live inside @else blocks —
   * they are added to the DOM only after Angular processes the signal change.
   * Without a manual detectChanges() call, the ViewChild refs may still be
   * undefined when syncCharts() runs from the reactive subscription.
   */
  private readonly cdr = inject(ChangeDetectorRef);

  // ── Canvas references (available after content renders) ─────────────────────
  @ViewChild('barCanvas') barCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('doughnutCanvas') doughnutCanvasRef?: ElementRef<HTMLCanvasElement>;

  private barChart?: Chart<'bar'>;
  private doughnutChart?: Chart<'doughnut'>;

  // ── Filter state ────────────────────────────────────────────────────────────
  readonly fromControl = new FormControl<Date | null>(null);
  readonly toControl = new FormControl<Date | null>(null);
  readonly rangeError = signal<string | null>(null);

  // ── Default: today (computed once at construction time) ─────────────────────
  private static todayNormalized(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ── Status derived from facade ──────────────────────────────────────────────
  readonly isLoading = computed(() => this.facade.state().status === 'loading');
  readonly isError = computed(() => this.facade.state().status === 'error');
  readonly errorMessage = computed(() => this.facade.state().errorMessage);
  readonly isEmpty = computed(() => this.facade.state().operations.length === 0);

  private viewInitialized = false;

  constructor() {
    // Set default date filter to today and immediately request filtered data from backend
    const today = ChartsPageComponent.todayNormalized();
    this.fromControl.setValue(today);
    this.toControl.setValue(today);
    this.facade.loadWithFilter(this.dateToYmd(today), this.dateToYmd(today));

    // Sync FormControl disabled state with loading signal (avoids [disabled] attribute
    // binding on reactive form elements which Angular warns about).
    effect(() => {
      const opts = { emitEvent: false };
      if (this.isLoading()) {
        this.fromControl.disable(opts);
        this.toControl.disable(opts);
      } else {
        this.fromControl.enable(opts);
        this.toControl.enable(opts);
      }
    });

    // Re-draw charts whenever the facade state changes (new data arrived, loading, error).
    toObservable(this.facade.state)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.viewInitialized) {
          this.syncCharts();
        }
      });
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.syncCharts();
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  // ── Chart lifecycle ─────────────────────────────────────────────────────────

  private readonly barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { title: { display: true, text: 'Fecha' } },
      y: {
        title: { display: true, text: 'Cantidad' },
        beginAtZero: true,
        ticks: { stepSize: 1 },
      },
    },
  };

  private readonly doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'bottom' } },
  };

  private syncCharts(): void {
    const ops = this.facade.state().operations;
    const showCharts = !this.isLoading() && !this.isError() && ops.length > 0;

    if (!showCharts) {
      // No canvases should be in DOM — destroy any existing Chart instances
      this.destroyCharts();
      return;
    }

    // The canvas elements live inside @else blocks in the template. When the
    // facade state transitions from 'loading' → 'content', the signal fires
    // and this method is called *before* Angular has run change detection to
    // render the @else branch.  Calling detectChanges() here forces a
    // synchronous DOM update so that barCanvasRef / doughnutCanvasRef are
    // guaranteed to point at the freshly-created canvas elements.
    this.cdr.detectChanges();

    const barEl = this.barCanvasRef?.nativeElement;
    const doughnutEl = this.doughnutCanvasRef?.nativeElement;
    if (!barEl || !doughnutEl) return;

    const barData = groupByDate(ops);
    const doughnutData = groupByType(ops);

    // Update existing chart or create a new one
    if (this.barChart) {
      this.barChart.data = barData;
      this.barChart.update('none'); // 'none' = no animation on data update
    } else {
      this.barChart = new Chart<'bar'>(barEl, {
        type: 'bar',
        data: barData,
        options: this.barOptions,
      });
    }

    if (this.doughnutChart) {
      this.doughnutChart.data = doughnutData;
      this.doughnutChart.update('none');
    } else {
      this.doughnutChart = new Chart<'doughnut'>(doughnutEl, {
        type: 'doughnut',
        data: doughnutData,
        options: this.doughnutOptions,
      });
    }
  }

  private destroyCharts(): void {
    this.barChart?.destroy();
    this.barChart = undefined;
    this.doughnutChart?.destroy();
    this.doughnutChart = undefined;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private dateToYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── Event handlers ──────────────────────────────────────────────────────────

  /**
   * Validates the date range and issues a new backend request with the selected
   * filters. The server returns only the matching ACTIVE operations.
   */
  onApply(): void {
    const from = this.fromControl.value;
    const to = this.toControl.value;
    if (from && to && from > to) {
      this.rangeError.set('La fecha "Desde" no puede ser posterior a la fecha "Hasta".');
      return;
    }
    this.rangeError.set(null);
    this.facade.loadWithFilter(
      from ? this.dateToYmd(from) : undefined,
      to ? this.dateToYmd(to) : undefined,
    );
  }

  /**
   * Clears the date inputs and resets the charts to an empty state immediately,
   * without making a backend request. The user can then apply a new filter via
   * onApply() (with or without date values) to load data.
   */
  onClear(): void {
    this.fromControl.setValue(null);
    this.toControl.setValue(null);
    this.rangeError.set(null);
    this.facade.reset();
  }

  onRetry(): void {
    this.facade.reload();
  }
}
