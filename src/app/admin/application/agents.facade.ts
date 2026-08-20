import { Injectable, signal, computed } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import {
  AgentResponse,
  CreateAgentRequest,
  UpdateAgentRequest,
} from './ports/agents-gateway';
import { AgentsHttpGateway } from '../adapters/out/http/agents-http.gateway';

export type AgentsLoadStatus = 'loading' | 'content' | 'error';

export interface AgentsState {
  status: AgentsLoadStatus;
  agents: AgentResponse[];
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class AgentsFacade {
  private readonly _state = signal<AgentsState>({
    status: 'loading',
    agents: [],
    error: null,
  });

  readonly state = this._state.asReadonly();

  constructor(private gateway: AgentsHttpGateway) {
    this.load();
  }

  private load(): void {
    this._state.set({ status: 'loading', agents: [], error: null });
    firstValueFrom(this.gateway.listAgents()).then(
      (agents) => this._state.set({ status: 'content', agents, error: null }),
      (err) =>
        this._state.set({
          status: 'error',
          agents: [],
          error: err?.message ?? 'Error cargando agentes',
        }),
    );
  }

  /** Reset to loading and re-fetch agents from backend. */
  reload(): void {
    this.load();
  }

  /** Create a new agent. Returns Observable so component can subscribe for success/error. */
  createAgent(req: CreateAgentRequest): Observable<AgentResponse> {
    return this.gateway.createAgent(req);
  }

  /** Update an existing agent. Returns Observable so component can subscribe. */
  updateAgent(id: string, req: UpdateAgentRequest): Observable<AgentResponse> {
    return this.gateway.updateAgent(id, req);
  }

  /** Change agent status (ACTIVO ↔ INACTIVO). Returns Observable so component can subscribe. */
  changeStatus(id: string, status: 'ACTIVO' | 'INACTIVO'): Observable<AgentResponse> {
    return this.gateway.changeStatus(id, status);
  }
}
