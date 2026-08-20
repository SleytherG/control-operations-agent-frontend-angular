import { Routes } from '@angular/router';
import { DashboardPageComponent } from './operations/adapters/in/ui/dashboard-page.component';
import { RegistrationPageComponent } from './operations/adapters/in/ui/registration-page.component';
import { HistoryPageComponent } from './operations/adapters/in/ui/history-page.component';
import { ChartsPageComponent } from './operations/adapters/in/ui/charts-page.component';
import { AdminDashboardPageComponent } from './admin/admin-dashboard-page.component';
import { LoginPageComponent } from './auth/login-page.component';
import { RecuperarContrasenaPageComponent } from './auth/recuperar-contrasena-page.component';
import { RestablecerContrasenaPageComponent } from './auth/restablecer-contrasena-page.component';
import { AgentsPageComponent } from './admin/agents-page.component';
import { UsersPageComponent } from './admin/users-page.component';
import { OperationTypesPageComponent } from './admin/operation-types-page.component';
import { RolesPageComponent } from './admin/roles-page.component';
import { AuditSessionsPageComponent } from './admin/audit-sessions-page.component';
import { ControlOperacionesPageComponent } from './admin/control-operaciones-page.component';
import { authGuard } from './core/auth.guard';
import { adminGuard } from './core/admin.guard';
import { operatorGuard } from './core/operator.guard';

export const routes: Routes = [
  // ── Public routes (no auth guard) ────────────────────────────────────────
  { path: 'login',                  component: LoginPageComponent },
  { path: 'recuperar-contrasena',   component: RecuperarContrasenaPageComponent },
  { path: 'restablecer-contrasena', component: RestablecerContrasenaPageComponent },

  // ── Operator routes (require authentication) ─────────────────────────────
  { path: 'dashboard', component: DashboardPageComponent,      canActivate: [operatorGuard] },
  { path: 'register',  component: RegistrationPageComponent,   canActivate: [authGuard] },
  { path: 'history',   component: HistoryPageComponent,        canActivate: [authGuard] },
  { path: 'charts',    component: ChartsPageComponent,         canActivate: [authGuard] },

  // ── Admin routes (require authentication; /audit also requires ADMIN role on the backend) ─
  { path: 'admin/dashboard',   component: AdminDashboardPageComponent,  canActivate: [adminGuard] },
  { path: 'agents',            component: AgentsPageComponent,          canActivate: [authGuard] },
  { path: 'users',             component: UsersPageComponent,           canActivate: [authGuard] },
  { path: 'operation-types',   component: OperationTypesPageComponent,  canActivate: [authGuard] },
  { path: 'admin/roles-permisos', component: RolesPageComponent,        canActivate: [adminGuard] },
  { path: 'audit',             component: AuditSessionsPageComponent,         canActivate: [adminGuard] },
  { path: 'admin/control-operaciones', component: ControlOperacionesPageComponent, canActivate: [adminGuard] },

  // ── Default ───────────────────────────────────────────────────────────────
  { path: '',  redirectTo: '/login', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' },
];
