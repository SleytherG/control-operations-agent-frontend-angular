import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CatalogGateway,
  DepartmentItem,
  DistrictItem,
  ProvinceItem,
} from '../../../application/ports/catalog-gateway';

/**
 * HTTP adapter for the geographic catalog.
 * Implements CatalogGateway using the existing backend endpoints:
 *   GET /api/v1/catalog/provinces?departmentId=X
 *   GET /api/v1/catalog/districts?provinceId=X
 *
 * Note: the backend uses "department" (not "region") as the top geographic level.
 * The UI labels it as "Región" but departmentId corresponds to departments.id in the DB.
 */
@Injectable({ providedIn: 'root' })
export class CatalogHttpGateway implements CatalogGateway {

  private readonly BASE = '/api/v1/catalog';

  constructor(private readonly http: HttpClient) {}

  getDepartments(): Observable<DepartmentItem[]> {
    return this.http.get<DepartmentItem[]>(`${this.BASE}/departments`);
  }

  getProvinces(departmentId: number): Observable<ProvinceItem[]> {
    return this.http.get<ProvinceItem[]>(
      `${this.BASE}/provinces`,
      { params: { departmentId: departmentId.toString() } }
    );
  }

  getDistricts(provinceId: number): Observable<DistrictItem[]> {
    return this.http.get<DistrictItem[]>(
      `${this.BASE}/districts`,
      { params: { provinceId: provinceId.toString() } }
    );
  }
}
