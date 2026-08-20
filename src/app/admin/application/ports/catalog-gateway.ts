import { Observable } from 'rxjs';

export interface DepartmentItem {
  id:   number;
  name: string;
}

export interface ProvinceItem {
  id:           number;
  name:         string;
  departmentId: number;
}

export interface DistrictItem {
  id:         number;
  name:       string;
  provinceId: number;
}

export interface CatalogGateway {
  getDepartments(): Observable<DepartmentItem[]>;
  getProvinces(departmentId: number): Observable<ProvinceItem[]>;
  getDistricts(provinceId: number): Observable<DistrictItem[]>;
}
