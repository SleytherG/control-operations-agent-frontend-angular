import {
  Component,
  AfterViewInit,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { OperatorDashboardFacade } from '../../../application/operator-dashboard.facade';

Chart.register(...registerables);

// ── Chart colour palette (D-06) ───────────────────────────────────────────
const COLOR_DEPOSIT    = '#4edea3';   // green  — Entradas
const COLOR_WITHDRAWAL = '#e63946';   // red    — Salidas (I1: consistent with spec)
const COLOR_OTHER      = '#bec6e0';   // grey   — other types
const COLOR_SURFACE    = '#e4e2e4';
const COLOR_TEXT       = '#45464d';

/**
 * Operator Dashboard page component (spec 013).
 *
 * Transforms the previous static component into a fully data-driven view.
 * All static KPI, chart and table data have been removed.
 *
 * Architecture notes:
 * - {@link OperatorDashboardFacade} provides 4 independent section signals (D-05, D-11).
 * - All 3 chart canvases are always in the DOM (never inside @if/@else) to prevent
 *   @ViewChild null reference in ngAfterViewInit (lesson from spec 012 T047).
 * - Chart overlay divs handle loading/error states without removing the canvas.
 * - D1 remediation: hour chart is built in ngAfterViewInit; doughnut is built afterwards,
 *   each in its own private method to avoid overwriting the other.
 */
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-page.component.html',
  styleUrl:   './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent implements OnInit, AfterViewInit, OnDestroy {

  // ── Canvas refs — always in DOM (D1 note / spec 012 T047) ─────────────────
  @ViewChild('hourlyChart')   hourlyRef!:   ElementRef<HTMLCanvasElement>;
  @ViewChild('doughnutChart') doughnutRef!: ElementRef<HTMLCanvasElement>;

  private hourlyChart?:   Chart;
  private doughnutChart?: Chart;

  private clockInterval?: ReturnType<typeof setInterval>;

  /** Clock signal updated every second for the page header (FR-017). */
  readonly currentTime = signal<string>('');

  // ── Facade ────────────────────────────────────────────────────────────────
  readonly facade = inject(OperatorDashboardFacade);

  // ── Greeting (US1) ────────────────────────────────────────────────────────
  readonly greeting = this.facade.greeting;

  // ── Computed helpers for the template (C4 / A2 remediations) ─────────────

  /**
   * Returns true only when variacionOpsVsAyer is a non-null number (C4 remediation).
   * The template uses this to conditionally render the variation subtexto.
   */
  readonly hasOpsVariation = computed(() =>
      this.facade.summaryState().data?.variacionOpsVsAyer != null);

  readonly hasMontoVariation = computed(() =>
      this.facade.summaryState().data?.variacionMontoVsAyer != null);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  constructor() {
    // Register chart update effects in constructor (injection context required)
    // Hourly chart update
    effect(() => {
      const state = this.facade.hourlyState();
      if (state.status === 'content' && state.data && this.hourlyChart) {
        const pts = state.data.points;
        this.hourlyChart.data.labels   = pts.map(p => p.hour);
        this.hourlyChart.data.datasets[0].data = pts.map(p => p.deposit);
        this.hourlyChart.data.datasets[1].data = pts.map(p => p.withdrawal);
        this.hourlyChart.data.datasets[2].data = pts.map(p => p.other);
        this.hourlyChart.update('active');
      }
    });

    // Doughnut chart update
    effect(() => {
      const state = this.facade.distributionState();
      if (state.status === 'content' && state.data && this.doughnutChart) {
        const segs = state.data.segments;
        this.doughnutChart.data.labels = segs.map(s => s.typeName);
        this.doughnutChart.data.datasets[0].data             = segs.map(s => s.count);
        this.doughnutChart.data.datasets[0].backgroundColor  = segs.map(s =>
            colorForCode(s.internalCode));
        this.doughnutChart.update('active');
      }
    });
  }

  ngOnInit(): void {
    this.facade.load();
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  ngAfterViewInit(): void {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color       = COLOR_TEXT;
    this.buildHourlyChart();   // T016
    this.buildDoughnutChart(); // T019 — separate method, does NOT overwrite hourly init (D1)
  }

  ngOnDestroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
    this.hourlyChart?.destroy();
    this.doughnutChart?.destroy();
  }

  // ── Formatting helpers (A2 remediation: use es-PE locale) ─────────────────

  formatAmount(value: number | null | undefined): string {
    if (value == null) return 'S/ 0.00';
    return 'S/ ' + value.toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  formatVariation(value: number | null | undefined): string {
    if (value == null) return '';
    return (value >= 0 ? '+' : '') + value.toFixed(2) + '% vs ayer';
  }

  /** I1 remediation: convert all-caps backend enum to title-case display. */
  formatLiquidez(liquidez: 'POSITIVO' | 'NEGATIVO' | undefined): string {
    if (!liquidez) return '';
    return liquidez === 'POSITIVO' ? 'Positivo' : 'Negativo';
  }

  isPositive(value: number | null | undefined): boolean {
    return (value ?? 0) >= 0;
  }

  engetTypeIcon(internalCode: string): string {
    switch (internalCode) {
      case 'INGRESO': return '↗';
      case 'EGRESO':  return '↙';
      default:        return '≡';
    }
  }

  getTypeClass(internalCode: string): string {
    switch (internalCode) {
      case 'INGRESO': return 'type-deposit';
      case 'EGRESO':  return 'type-withdrawal';
      default:        return 'type-other';
    }
  }

  /** Returns the chart colour for a given operation_type internal code. Used by legend dots. */
  getColorForCode(internalCode: string): string {
    return colorForCode(internalCode);
  }

  // ── Private — clock ────────────────────────────────────────────────────────

  private updateClock(): void {
    this.currentTime.set(
        new Date().toLocaleTimeString('es-ES', { hour12: false })
    );
  }

  // ── Private — chart builders ───────────────────────────────────────────────

  /** T016: stacked bar chart — Entradas / Salidas / Other by hour. */
  private buildHourlyChart(): void {
    this.hourlyChart = new Chart(this.hourlyRef.nativeElement, {
      type: 'bar',
      data: {
        labels:   [],
        datasets: [
          {
            label:           'Entradas',
            data:            [],
            backgroundColor: COLOR_DEPOSIT,
            borderRadius:    4,
            barPercentage:   0.6,
            categoryPercentage: 0.8,
            stack:           'ops',
          },
          {
            label:           'Salidas',
            data:            [],
            backgroundColor: COLOR_WITHDRAWAL,
            borderRadius:    4,
            barPercentage:   0.6,
            categoryPercentage: 0.8,
            stack:           'ops',
          },
          {
            label:           'Otros',
            data:            [],
            backgroundColor: COLOR_OTHER,
            borderRadius:    4,
            barPercentage:   0.6,
            categoryPercentage: 0.8,
            stack:           'ops',
          },
        ],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend:  { display: false },
          tooltip: {
            mode:       'index',
            intersect:  false,
            backgroundColor: '#1b1b1d',
            padding:    10,
            cornerRadius: 4,
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, border: { display: false } },
          y: { stacked: true, beginAtZero: true, border: { display: false },
               grid: { color: COLOR_SURFACE } },
        },
      },
    });
  }

  /** T019: doughnut chart — distribution by type, centre overlay shows totalOps. */
  private buildDoughnutChart(): void {
    this.doughnutChart = new Chart(this.doughnutRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels:   [],
        datasets: [{
          data:            [],
          backgroundColor: [],
          borderWidth:     0,
          hoverOffset:     6,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        cutout:              '70%',
        // layout.padding prevents hoverOffset arc expansion from being clipped
        layout: { padding: 12 },
        plugins: {
          legend:  { display: false },
          tooltip: {
            // 'nearest' places the tooltip near the cursor/segment edge,
            // preventing it from floating into the donut centre hole where
            // the HTML overlay (total ops) lives.
            position:        'nearest',
            backgroundColor: '#1b1b1d',
            padding:         10,
            cornerRadius:    4,
            callbacks: {
              label: ctx => `${ctx.label}: ${ctx.parsed} ops`,
            },
          },
        },
      },
    });
  }
}

/** Maps a flow direction code (INGRESO/EGRESO) to its chart colour. */
function colorForCode(code: string): string {
  switch (code) {
    case 'INGRESO': return COLOR_DEPOSIT;    // green — entradas
    case 'EGRESO':  return COLOR_WITHDRAWAL; // red   — salidas
    default:        return COLOR_OTHER;
  }
}
