import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AgentResponse,
  CreateAgentRequest,
  UpdateAgentRequest,
} from '../../../application/ports/agents-gateway';

/**
 * HTTP implementation of AgentsGateway.
 * Calls the backend REST endpoints defined in contracts/agents-api.yaml.
 * Base path: /api/v1/agents
 */
@Injectable({ providedIn: 'root' })
export class AgentsHttpGateway {
  private readonly base = '/api/v1/agents';

  constructor(private http: HttpClient) {}

  listAgents(): Observable<AgentResponse[]> {
    return this.http.get<AgentResponse[]>(this.base);
  }

  createAgent(req: CreateAgentRequest): Observable<AgentResponse> {
    return this.http.post<AgentResponse>(this.base, req);
  }

  updateAgent(id: string, req: UpdateAgentRequest): Observable<AgentResponse> {
    return this.http.put<AgentResponse>(`${this.base}/${id}`, req);
  }

  changeStatus(id: string, status: 'ACTIVO' | 'INACTIVO'): Observable<AgentResponse> {
    return this.http.patch<AgentResponse>(`${this.base}/${id}/status`, { status });
  }
}
