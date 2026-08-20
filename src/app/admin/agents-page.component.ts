import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { trigger, style, animate, transition } from '@angular/animations';
import { firstValueFrom } from 'rxjs';

import { AgentsFacade } from './application/agents.facade';
import { AgentResponse } from './application/ports/agents-gateway';
import { CatalogHttpGateway } from './adapters/out/http/catalog-http.gateway';
import {
  DepartmentItem,
  ProvinceItem,
  DistrictItem,
} from './application/ports/catalog-gateway';

export interface RegionGroup {
  department: string;
  icon: string;
  activeCount: number;
  agents: AgentResponse[];
}

function iconForDepartment(name: string): string {
  const icons: Record<string, string> = {
    Lima: 'location_city',
    Callao: 'anchor',
    Arequipa: 'landscape',
    Cusco: 'temple_buddhist',
    Piura: 'waves',
    Trujillo: 'corporate_fare',
  };
  return icons[name] ?? 'place';
}

@Component({
  selector: 'app-agents-page',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './agents-page.component.html',
  styleUrl: './agents-page.component.scss',
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
export class AgentsPageComponent {
  readonly facade = inject(AgentsFacade);
  private readonly catalogGateway = inject(CatalogHttpGateway);
  private readonly fb = inject(FormBuilder);

  // ── Search ─────────────────────────────────────────────────────
  /** Committed search term — set only when user selects from dropdown */
  readonly searchTerm = signal('');

  /** Raw value displayed in the search input */
  readonly searchInputValue = signal('');

  /** Controls visibility of the autocomplete dropdown */
  readonly showAutocompleteDropdown = signal(false);

  /** Options filtered from loaded agents by the current input value */
  readonly autocompleteOptions = computed(() => {
    const value = this.searchInputValue().toLowerCase().trim();
    if (!value) return [];
    const allAgents = this.facade.state().agents;
    const seen = new Set<string>();
    const results: { businessName: string; agentCode: string }[] = [];
    for (const agent of allAgents) {
      if (!seen.has(agent.businessName) && agent.businessName.toLowerCase().includes(value)) {
        seen.add(agent.businessName);
        results.push({ businessName: agent.businessName, agentCode: agent.agentCode });
      }
    }
    return results.slice(0, 8);
  });

  onSearchInput(value: string): void {
    this.searchInputValue.set(value);
    this.showAutocompleteDropdown.set(value.trim().length > 0);
    if (!value.trim()) {
      this.searchTerm.set('');
    }
  }

  onSearchBlur(): void {
    // Delay allows mousedown on an option to fire before the dropdown hides
    setTimeout(() => this.showAutocompleteDropdown.set(false), 150);
  }

  onAutocompleteSelect(option: { businessName: string; agentCode: string }): void {
    this.searchInputValue.set(option.businessName);
    this.searchTerm.set(option.businessName);
    this.showAutocompleteDropdown.set(false);
  }

  readonly regions = computed<RegionGroup[]>(() => {
    const agents = this.facade.state().agents;
    const groups = new Map<string, AgentResponse[]>();
    for (const agent of agents) {
      const list = groups.get(agent.department) ?? [];
      list.push(agent);
      groups.set(agent.department, list);
    }
    return Array.from(groups.entries()).map(([dept, agentList]) => ({
      department: dept,
      icon: iconForDepartment(dept),
      activeCount: agentList.filter((a) => a.status === 'ACTIVO').length,
      agents: agentList,
    }));
  });

  readonly filteredRegions = computed<RegionGroup[]>(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.regions();
    return this.regions()
      .map((r) => ({
        ...r,
        agents: r.agents.filter((a) => a.businessName.toLowerCase().includes(term)),
      }))
      .filter((r) => r.agents.length > 0);
  });

  // ── Toggle ─────────────────────────────────────────────────────
  readonly pendingToggles = signal<Set<string>>(new Set());

  isTogglePending(agentId: string): boolean {
    return this.pendingToggles().has(agentId);
  }

  onToggleStatus(agent: AgentResponse): void {
    if (this.isTogglePending(agent.id)) return;
    const newStatus: 'ACTIVO' | 'INACTIVO' = agent.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    this.pendingToggles.update((s) => new Set([...s, agent.id]));
    firstValueFrom(this.facade.changeStatus(agent.id, newStatus)).then(
      () => {
        this.pendingToggles.update((s) => { const n = new Set(s); n.delete(agent.id); return n; });
        this.facade.reload();
      },
      () => {
        this.pendingToggles.update((s) => { const n = new Set(s); n.delete(agent.id); return n; });
        this.facade.reload();
      },
    );
  }

  // ── Add Panel ──────────────────────────────────────────────────
  showAddPanel = false;
  addSaveError = '';
  addSaving = false;
  readonly departments = signal<DepartmentItem[]>([]);
  readonly addProvinces = signal<ProvinceItem[]>([]);
  readonly addDistricts = signal<DistrictItem[]>([]);

  addForm: FormGroup = this.fb.group({
    businessName: ['', Validators.required],
    ownerName: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(/^\+?51[0-9]{9}$|^[0-9]{9}$/)]],
    address: ['', Validators.required],
    departmentId: [null, Validators.required],
    provinceId: [null, Validators.required],
    districtId: [null, Validators.required],
    departmentName: [''],
    provinceName: [''],
    districtName: [''],
  });

  openAddPanel(): void {
    this.showEditPanel = false;
    this.showAddPanel = true;
    this.addSaveError = '';
    this.addForm.reset();
    this.addProvinces.set([]);
    this.addDistricts.set([]);
    if (this.departments().length === 0) {
      firstValueFrom(this.catalogGateway.getDepartments()).then((depts) => {
        this.departments.set(depts);
      });
    }
  }

  closeAddPanel(): void {
    this.showAddPanel = false;
  }

  onAddDeptChange(event: Event): void {
    const deptId = Number((event.target as HTMLSelectElement).value);
    const dept = this.departments().find((d) => d.id === deptId);
    this.addForm.patchValue({ departmentId: deptId, departmentName: dept?.name ?? '', provinceId: null, districtId: null, provinceName: '', districtName: '' });
    this.addProvinces.set([]);
    this.addDistricts.set([]);
    if (deptId) {
      firstValueFrom(this.catalogGateway.getProvinces(deptId)).then((provs) => { this.addProvinces.set(provs); });
    }
  }

  onAddProvChange(event: Event): void {
    const provId = Number((event.target as HTMLSelectElement).value);
    const prov = this.addProvinces().find((p) => p.id === provId);
    this.addForm.patchValue({ provinceId: provId, provinceName: prov?.name ?? '', districtId: null, districtName: '' });
    this.addDistricts.set([]);
    if (provId) {
      firstValueFrom(this.catalogGateway.getDistricts(provId)).then((dists) => { this.addDistricts.set(dists); });
    }
  }

  onAddDistChange(event: Event): void {
    const distId = Number((event.target as HTMLSelectElement).value);
    const dist = this.addDistricts().find((d) => d.id === distId);
    this.addForm.patchValue({ districtId: distId, districtName: dist?.name ?? '' });
  }

  saveAgent(): void {
    if (this.addForm.invalid || this.addSaving) return;
    this.addSaving = true;
    this.addSaveError = '';
    const v = this.addForm.value;
    firstValueFrom(this.facade.createAgent({
      businessName: v.businessName,
      ownerName: v.ownerName,
      phone: v.phone,
      address: v.address,
      district: v.districtName,
      province: v.provinceName,
      department: v.departmentName,
      districtId: v.districtId,
      provinceId: v.provinceId,
      departmentId: v.departmentId,
    })).then(
      () => { this.addSaving = false; this.showAddPanel = false; this.facade.reload(); },
      (err) => { this.addSaving = false; this.addSaveError = err?.error?.detail ?? 'Error al guardar el agente'; },
    );
  }

  // ── Edit Panel ─────────────────────────────────────────────────
  showEditPanel = false;
  selectedAgent: AgentResponse | null = null;
  editSaveError = '';
  editSaving = false;
  readonly editProvinces = signal<ProvinceItem[]>([]);
  readonly editDistricts = signal<DistrictItem[]>([]);

  editForm: FormGroup = this.fb.group({
    businessName: ['', Validators.required],
    ownerName: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(/^\+?51[0-9]{9}$|^[0-9]{9}$/)]],
    address: ['', Validators.required],
    departmentId: [null, Validators.required],
    provinceId: [null, Validators.required],
    districtId: [null, Validators.required],
    departmentName: [''],
    provinceName: [''],
    districtName: [''],
    status: [true],
  });

  openEditPanel(agent: AgentResponse): void {
    this.selectedAgent = agent;
    this.showAddPanel = false;
    this.showEditPanel = true;
    this.editSaveError = '';
    this.editProvinces.set([]);
    this.editDistricts.set([]);
    this.editForm.patchValue({
      businessName: agent.businessName,
      ownerName: agent.ownerName,
      phone: agent.phone,
      address: agent.address,
      departmentId: null,
      provinceId: null,
      districtId: null,
      departmentName: agent.department,
      provinceName: agent.province,
      districtName: agent.district,
      status: agent.status === 'ACTIVO',
    });
    const loadDepts = this.departments().length === 0
      ? firstValueFrom(this.catalogGateway.getDepartments()).then((d) => { this.departments.set(d); })
      : Promise.resolve();
    loadDepts.then(() => {
      setTimeout(() => this.editForm.patchValue({ departmentId: agent.departmentId }));
      return firstValueFrom(this.catalogGateway.getProvinces(agent.departmentId));
    }).then((provs) => {
      this.editProvinces.set(provs);
      setTimeout(() => this.editForm.patchValue({ provinceId: agent.provinceId }));
      return firstValueFrom(this.catalogGateway.getDistricts(agent.provinceId));
    }).then((dists) => {
      this.editDistricts.set(dists);
      setTimeout(() => this.editForm.patchValue({ districtId: agent.districtId }));
    });
  }

  closeEditPanel(): void {
    this.showEditPanel = false;
    this.selectedAgent = null;
  }

  onEditDeptChange(event: Event): void {
    const deptId = Number((event.target as HTMLSelectElement).value);
    const dept = this.departments().find((d) => d.id === deptId);
    this.editForm.patchValue({ departmentId: deptId, departmentName: dept?.name ?? '', provinceId: null, districtId: null, provinceName: '', districtName: '' });
    this.editProvinces.set([]);
    this.editDistricts.set([]);
    if (deptId) {
      firstValueFrom(this.catalogGateway.getProvinces(deptId)).then((provs) => { this.editProvinces.set(provs); });
    }
  }

  onEditProvChange(event: Event): void {
    const provId = Number((event.target as HTMLSelectElement).value);
    const prov = this.editProvinces().find((p) => p.id === provId);
    this.editForm.patchValue({ provinceId: provId, provinceName: prov?.name ?? '', districtId: null, districtName: '' });
    this.editDistricts.set([]);
    if (provId) {
      firstValueFrom(this.catalogGateway.getDistricts(provId)).then((dists) => { this.editDistricts.set(dists); });
    }
  }

  onEditDistChange(event: Event): void {
    const distId = Number((event.target as HTMLSelectElement).value);
    const dist = this.editDistricts().find((d) => d.id === distId);
    this.editForm.patchValue({ districtId: distId, districtName: dist?.name ?? '' });
  }

  saveEdit(): void {
    if (this.editForm.invalid || this.editSaving || !this.selectedAgent) return;
    this.editSaving = true;
    this.editSaveError = '';
    const v = this.editForm.value;
    firstValueFrom(this.facade.updateAgent(this.selectedAgent.id, {
      businessName: v.businessName,
      ownerName: v.ownerName,
      phone: v.phone,
      address: v.address,
      district: v.districtName,
      province: v.provinceName,
      department: v.departmentName,
      districtId: v.districtId,
      provinceId: v.provinceId,
      departmentId: v.departmentId,
      status: v.status ? 'ACTIVO' : 'INACTIVO',
    })).then(
      () => {
        this.editSaving = false;
        this.showEditPanel = false;
        this.selectedAgent = null;
        this.facade.reload();
      },
      (err) => {
        this.editSaving = false;
        this.editSaveError = err?.error?.detail ?? 'Error al guardar los cambios';
      },
    );
  }
}
