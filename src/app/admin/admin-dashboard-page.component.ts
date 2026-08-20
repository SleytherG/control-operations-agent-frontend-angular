import {
  Component,
  AfterViewInit,
  OnDestroy,
  OnInit,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormControl, FormGroup } from '@angular/forms';
import { Chart, registerables, ChartData } from 'chart.js';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';

import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DashboardFacade } from './application/dashboard.facade';
import { UsersFacade } from './application/users.facade';
import { CatalogHttpGateway } from './adapters/out/http/catalog-http.gateway';
import {
  AgentPanelFilter,
  AgentPanelMode,
  DEFAULT_AGENT_PANEL_FILTER,
} from './application/ports/dashboard-gateway';
import {
  DepartmentItem,
  ProvinceItem,
  DistrictItem,
} from './application/ports/catalog-gateway';

Chart.register(...registerables);

// ── Design-system colour cycle for agent doughnut ────────────────────────────
const COLOR_CYCLE = [
  '#0b1c30', // on-secondary-fixed
  '#505f76', // secondary
  '#bec6e0', // primary-fixed-dim
  '#eae7e9', // surface-container-high
];

// ── Design-system colour tokens ───────────────────────────────────────────────
const C = {
  onSecondaryFixed:     '#0b1c30',
  secondaryContainer:   '#d0e1fb',
  tertiaryFixedDim:     '#4edea3',
  error:                '#ba1a1a',
  surfaceContainerHigh: '#eae7e9',
  secondary:            '#505f76',
  primaryFixedDim:      '#bec6e0',
  outlineVariant:       '#c6c6cd',
  onSurfaceVariant:     '#45464d',
};

@Component({
  selector: 'app-admin-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './admin-dashboard-page.component.html',
  styleUrl: './admin-dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardPageComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('evolutionChart')    evolutionRef!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('agentDoughnutChart') agentDoughnutRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('flowBarChart')      flowBarRef!:      ElementRef<HTMLCanvasElement>;

  private evolutionChart?:    Chart;
  private agentDoughnutChart?: Chart;
  private flowBarChart?:      Chart;

  private readonly destroy$ = new Subject<void>();

  // ── Facade (reactive data) ────────────────────────────────────────────────
  constructor(
    readonly facade: DashboardFacade,
    readonly usersFacade: UsersFacade,
    private readonly catalogGateway: CatalogHttpGateway,
  ) {
    // Register chart update effects in the constructor (injection context).
    // Charts are null until ngAfterViewInit — the guard check ensures no-op until ready.
    effect(() => {
      const data = this.evolutionChartData();
      if (data && this.evolutionChart) {
        this.evolutionChart.data = data;
        this.evolutionChart.update('active');
      }
    });
    effect(() => {
      const data = this.agentChartData();
      if (data && this.agentDoughnutChart) {
        this.agentDoughnutChart.data = data;
        this.agentDoughnutChart.update('active');
      }
    });
    effect(() => {
      const data = this.flowChartData();
      if (data && this.flowBarChart) {
        this.flowBarChart.data = data;
        this.flowBarChart.update('active');
      }
    });
  }

  // ── Local signals ─────────────────────────────────────────────────────────

  readonly volValMode      = signal<'vol' | 'val'>('vol');
  readonly agentPanelFilter = signal<AgentPanelFilter>({ ...DEFAULT_AGENT_PANEL_FILTER });

  // Filter cascades
  readonly departments = signal<DepartmentItem[]>([]);
  readonly provinces   = signal<ProvinceItem[]>([]);
  readonly districts   = signal<DistrictItem[]>([]);

  // Currently selected filter values (for HTML binding)
  readonly selectedDepartmentId = signal<number | null>(null);
  readonly selectedProvinceId   = signal<number | null>(null);
  readonly selectedDistrictId   = signal<number | null>(null);
  readonly selectedDateRange     = signal<string>('HOY');
  readonly selectedStatus        = signal<string>('TODOS');
  readonly showCustomDateRange   = signal(false);

  // Rango Personalizado — date range picker FormGroup for mat-date-range-input
  readonly startDateCtrl  = new FormControl<Date | null>(null);
  readonly endDateCtrl    = new FormControl<Date | null>(null);
  readonly dateRangeGroup = new FormGroup({
    fechaInicio: this.startDateCtrl as FormControl<Date | null>,
    fechaFin:    this.endDateCtrl   as FormControl<Date | null>,
  });

  /** Formats a Date for display as "DD/MM/YY". */
  formatDateDisplay(date: Date | null): string {
    if (!date) return '';
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = String(date.getFullYear()).slice(-2);
    return `${d}/${m}/${y}`;
  }

  /** Display value for the date range trigger. */
  get dateRangeDisplay(): string {
    const start = this.startDateCtrl.value;
    const end   = this.endDateCtrl.value;
    if (!start && !end) return '';
    return `${start ? this.formatDateDisplay(start) : '...'} - ${end ? this.formatDateDisplay(end) : '...'}`;
  }

  // Operador custom autocomplete
  operatorInputValue   = '';
  showOperatorDropdown = false;

  // Agent panel select values
  readonly agentPanelRegionId  = signal<string | null>(null);
  readonly agentPanelAgentId   = signal<string | null>(null);
  readonly agentPanelMode      = signal<AgentPanelMode>('NINGUNO');

  // ── Computed chart data ───────────────────────────────────────────────────

  readonly evolutionChartData = computed<ChartData<'line'> | null>(() => {
    const state = this.facade.evolutionState();
    if (state.status !== 'content' || !state.data) return null;
    const { points } = state.data;
    return {
      labels: points.map(p => p.hour),
      datasets: [{
        label: this.volValMode() === 'vol' ? 'Volumen' : 'Valor (S/)',
        data: points.map(p => p.value),
        borderColor:          C.onSecondaryFixed,
        backgroundColor:      C.secondaryContainer + '40',
        borderWidth: 2,
        pointBackgroundColor: C.onSecondaryFixed,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.4,
      }],
    };
  });

  readonly agentChartData = computed<ChartData<'doughnut'> | null>(() => {
    const state = this.facade.agentDistState();
    if (state.status !== 'content' || !state.data) return null;
    const { segments } = state.data;
    return {
      labels: segments.map(s => s.name),
      datasets: [{
        data: segments.map(s => s.volume),
        backgroundColor: segments.map(s => COLOR_CYCLE[s.colorIndex % COLOR_CYCLE.length]),
        borderWidth: 0,
        hoverOffset: 4,
      }],
    };
  });

  readonly flowChartData = computed<ChartData<'bar'> | null>(() => {
    const state = this.facade.flowState();
    if (state.status !== 'content' || !state.data) return null;
    const { regions } = state.data;
    return {
      labels: regions.map(r => r.region),
      datasets: [
        {
          label: 'Entradas',
          data: regions.map(r => r.entradas),
          backgroundColor: C.tertiaryFixedDim,
          borderRadius: 2,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
        },
        {
          label: 'Salidas',
          data: regions.map(r => r.salidas),
          backgroundColor: C.surfaceContainerHigh,
          borderRadius: 2,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
        },
      ],
    };
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onOperatorInput(value: string): void {
    this.operatorInputValue = value;
    this.showOperatorDropdown = value.trim().length > 0;
    // Use UsersFacade autocomplete to search actual system users
    if (value.trim()) {
      this.usersFacade.searchAutocomplete(value.trim());
    } else {
      this.usersFacade.clearAutocomplete();
      this.facade.applyFilter({ operator: null });
    }
  }

  onOperatorBlur(): void {
    setTimeout(() => {
      this.showOperatorDropdown = false;
      this.usersFacade.clearAutocomplete();
    }, 150);
  }

  onOperatorSelect(name: string): void {
    this.operatorInputValue = name;
    this.showOperatorDropdown = false;
    this.usersFacade.clearAutocomplete();
    this.facade.applyFilter({ operator: name || null });
  }

  ngOnInit(): void {
    // Load departments for the Región filter
    this.catalogGateway.getDepartments().subscribe(depts => this.departments.set(depts));

    // Rango Personalizado two-date gate (D11
    this.startDateCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.tryApplyCustomDateRange();
    });
    this.endDateCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.tryApplyCustomDateRange();
    });
  }

  ngAfterViewInit(): void {
    // Set Chart.js global defaults
    Chart.defaults.font.family   = "'Inter', sans-serif";
    Chart.defaults.color          = C.onSurfaceVariant;
    Chart.defaults.plugins.tooltip.backgroundColor = '#1b1b1d';
    Chart.defaults.plugins.tooltip.padding         = 12;
    Chart.defaults.plugins.tooltip.cornerRadius    = 4;

    this.buildEvolutionChart();
    this.buildAgentDoughnutChart();
    this.buildFlowBarChart();

  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.evolutionChart?.destroy();
    this.agentDoughnutChart?.destroy();
    this.flowBarChart?.destroy();
  }

  // ── Filter event handlers ─────────────────────────────────────────────────

  onDateRangeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedDateRange.set(value);
    this.showCustomDateRange.set(value === 'PERSONALIZADO');
    if (value !== 'PERSONALIZADO') {
      this.startDateCtrl.setValue(null, { emitEvent: false });
      this.endDateCtrl.setValue(null, { emitEvent: false });
      this.facade.applyFilter({
        dateRange: value as any,
        startDate: null,
        endDate:   null,
      });
    }
  }

  async onRegionChange(event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value;
    const deptId = value ? parseInt(value, 10) : null;
    this.selectedDepartmentId.set(deptId);
    this.selectedProvinceId.set(null);
    this.selectedDistrictId.set(null);
    this.provinces.set([]);
    this.districts.set([]);
    this.facade.applyFilter({ departmentId: deptId, provinceId: null, districtId: null });

    if (deptId) {
      const provs = await firstValueFrom(this.catalogGateway.getProvinces(deptId));
      this.provinces.set(provs);
    }
  }

  async onProvinceChange(event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value;
    const provId = value ? parseInt(value, 10) : null;
    this.selectedProvinceId.set(provId);
    this.selectedDistrictId.set(null);
    this.districts.set([]);
    this.facade.applyFilter({ provinceId: provId, districtId: null });

    if (provId) {
      const dists = await firstValueFrom(this.catalogGateway.getDistricts(provId));
      this.districts.set(dists);
    }
  }

  onDistrictChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const distId = value ? parseInt(value, 10) : null;
    this.selectedDistrictId.set(distId);
    this.facade.applyFilter({ districtId: distId });
  }

  onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedStatus.set(value);
    this.facade.applyFilter({ operationStatus: value as any });
  }

  onLimpiar(): void {
    // Reset local state
    this.selectedDepartmentId.set(null);
    this.selectedProvinceId.set(null);
    this.selectedDistrictId.set(null);
    this.selectedDateRange.set('HOY');
    this.selectedStatus.set('TODOS');
    this.showCustomDateRange.set(false);
    this.provinces.set([]);
    this.districts.set([]);
    this.startDateCtrl.setValue(null, { emitEvent: false });
    this.endDateCtrl.setValue(null, { emitEvent: false });
    this.operatorInputValue   = '';
    this.showOperatorDropdown = false;
    this.agentPanelMode.set('NINGUNO');
    this.agentPanelRegionId.set(null);
    this.agentPanelAgentId.set(null);
    this.agentPanelFilter.set({ ...DEFAULT_AGENT_PANEL_FILTER });
    this.facade.reset();
  }

  onActualizarDatos(): void {
    this.facade.reload();
  }

  onExportarReporte(): void {
    // FR-008 deferred — show "próximamente disponible" message
    // For now, show a simple browser alert; replace with a proper toast when available
    alert('Exportar Reporte — Próximamente disponible');
  }

  onVolVal(mode: 'vol' | 'val'): void {
    this.volValMode.set(mode);
    this.facade.applyEvolutionMode(mode);
  }

  // ── Agent panel filter handlers ───────────────────────────────────────────

  onAgentPanelRegionChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.agentPanelRegionId.set(value || null);
    this.agentPanelAgentId.set(null);
    this.agentPanelMode.set(value ? 'POR_REGION' : 'NINGUNO');
    const panel: AgentPanelFilter = { mode: value ? 'POR_REGION' : 'NINGUNO', value: value || null };
    this.agentPanelFilter.set(panel);
    this.facade.applyAgentPanelFilter(panel);
  }

  onAgentPanelAgentChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.agentPanelAgentId.set(value || null);
    this.agentPanelRegionId.set(null);
    this.agentPanelMode.set(value ? 'POR_AGENTE' : 'NINGUNO');
    const panel: AgentPanelFilter = { mode: value ? 'POR_AGENTE' : 'NINGUNO', value: value || null };
    this.agentPanelFilter.set(panel);
    this.facade.applyAgentPanelFilter(panel);
  }

  // ── Rango Personalizado helper (D11) ──────────────────────────────────────

  private tryApplyCustomDateRange(): void {
    const start = this.startDateCtrl.value;
    const end   = this.endDateCtrl.value;
    if (start && end) {
      const toIso = (d: Date) => {
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${mo}-${day}`;
      };
      this.facade.applyFilter({
        dateRange: 'PERSONALIZADO',
        startDate: toIso(start),
        endDate:   toIso(end),
      });
    }
  }

  // ── Currency formatting helper ────────────────────────────────────────────

  formatSoles(amount: number | null | undefined): string {
    if (amount == null) return 'S/ 0.00';
    return 'S/ ' + amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatPct(pct: number | null | undefined): string {
    if (pct == null) return '0.00%';
    return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
  }

  // ── Chart initializers ────────────────────────────────────────────────────

  private buildEvolutionChart(): void {
    this.evolutionChart = new Chart(this.evolutionRef.nativeElement, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, border: { display: false }, ticks: { maxTicksLimit: 6 } },
          x: { grid: { display: false }, border: { display: false } },
        },
      },
    });
  }

  private buildAgentDoughnutChart(): void {
    this.agentDoughnutChart = new Chart(this.agentDoughnutRef.nativeElement, {
      type: 'doughnut',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: { legend: { display: false } },
      },
    });
  }

  private buildFlowBarChart(): void {
    this.flowBarChart = new Chart(this.flowBarRef.nativeElement, {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, font: { size: 11, weight: 'bold' } },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            border: { display: false },
            ticks: {
              maxTicksLimit: 5,
              callback: (v) => 'S/ ' + v + 'k',
            },
          },
          x: { grid: { display: false }, border: { display: false } },
        },
      },
    });
  }
}
