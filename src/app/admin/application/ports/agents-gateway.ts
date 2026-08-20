import { Observable } from 'rxjs';

export interface AgentResponse {
  id: string;
  agentCode: string;
  businessName: string;
  ownerName: string;
  phone: string;
  address: string;
  district: string;
  province: string;
  department: string;
  districtId: number;
  provinceId: number;
  departmentId: number;
  status: 'ACTIVO' | 'INACTIVO';
  dailyVolume: string;
}

export interface CreateAgentRequest {
  businessName: string;
  ownerName: string;
  phone: string;
  address: string;
  district: string;
  province: string;
  department: string;
  districtId: number;
  provinceId: number;
  departmentId: number;
}

export interface UpdateAgentRequest {
  businessName: string;
  ownerName: string;
  phone: string;
  address: string;
  district: string;
  province: string;
  department: string;
  districtId: number;
  provinceId: number;
  departmentId: number;
  status: 'ACTIVO' | 'INACTIVO';
}

export interface AgentsGateway {
  listAgents(): Observable<AgentResponse[]>;
  createAgent(req: CreateAgentRequest): Observable<AgentResponse>;
  updateAgent(id: string, req: UpdateAgentRequest): Observable<AgentResponse>;
  changeStatus(id: string, status: 'ACTIVO' | 'INACTIVO'): Observable<AgentResponse>;
}

export const AGENTS_GATEWAY = Symbol('AgentsGateway');
