import { Component, signal, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthFacade } from './application/auth.facade';

/**
 * LoginPageComponent — /login route
 * Pixel-perfect implementation based on mockup screen 05 (05-inicio-de-sesion).
 *
 * Features:
 * - US1: Valid credential login with loading spinner
 * - US2/US3/US4: Error banners for credentials/deactivated/network/rateLimit
 * - US5: Password visibility toggle
 * - FR-012: Redirects if already authenticated (handled in ngOnInit)
 */
@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss'],
})
export class LoginPageComponent implements OnInit {
  protected readonly facade = inject(AuthFacade);
  private readonly router = inject(Router);

  email = '';
  password = '';
  passwordVisible = signal(false);

  ngOnInit(): void {
    // FR-012: Already authenticated → redirect to home immediately
    if (this.facade.isAuthenticated()) {
      const role = this.facade.currentUser()?.role;
      const destination = role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';
      this.router.navigate([destination]);
    }
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update(v => !v);
  }

  async onSubmit(): Promise<void> {
    if (!this.email.trim() || !this.password.trim()) return;
    await this.facade.login(this.email, this.password);
  }

  closeError(): void {
    this.facade.clearError();
  }

  /** Dismiss the session-revoked banner and clear the reason from the facade. */
  closeSessionRevoked(): void {
    this.facade.clearSessionRevoked();
  }

  /** True when the session was revoked by a login on another device (FR-028). */
  get isSessionRevoked(): boolean {
    return this.facade.sessionRevokedReason() === 'session_revoked';
  }

  /** FR-009 exact error title by errorType */
  get errorTitle(): string {
    switch (this.facade.state().errorType) {
      case 'credentials': return 'Credenciales incorrectas';
      case 'deactivated': return 'Usuario desactivado';
      case 'network': return 'Error de conexión';
      case 'rateLimit': return 'Demasiados intentos';
      default: return '';
    }
  }

  /** FR-009 exact error message by errorType */
  get errorMessage(): string {
    switch (this.facade.state().errorType) {
      case 'credentials': return 'El usuario o la contraseña no coinciden. Intente de nuevo.';
      case 'deactivated': return 'Su cuenta de agente ha sido suspendida. Contacte soporte.';
      case 'network': return 'No se pudo conectar con el servidor central. Verifique su red.';
      case 'rateLimit': return 'Ha superado el número máximo de intentos. Intente de nuevo en unos minutos.';
      default: return '';
    }
  }

  get isLoading(): boolean {
    return this.facade.state().status === 'loading';
  }

  get hasError(): boolean {
    return this.facade.state().status === 'error' && this.facade.state().errorType !== null;
  }

  get isRateLimited(): boolean {
    return this.facade.state().errorType === 'rateLimit';
  }
}
