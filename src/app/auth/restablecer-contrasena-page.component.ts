import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { AuthFacade } from './application/auth.facade';

interface PasswordRules {
  minLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

type StrengthLevel = 'weak' | 'fair' | 'strong' | 'veryStrong' | 'none';

/**
 * RestablecerContrasenaPageComponent — /restablecer-contrasena route
 * Pixel-perfect per mockup screen 18 (18-restablecer-contrasena-nueva-clave-v3).
 * FR-017: Reset password form with requirements panel and strength meter.
 * FR-015b: Validates token from URL; shows error if invalid/expired.
 */
@Component({
  selector: 'app-restablecer-contrasena-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './restablecer-contrasena-page.component.html',
  styleUrls: ['./restablecer-contrasena-page.component.scss'],
})
export class RestablecerContrasenaPageComponent implements OnInit {
  protected readonly facade = inject(AuthFacade);
  private readonly route = inject(ActivatedRoute);

  token = '';
  newPassword = '';
  confirmPassword = '';
  newPasswordVisible = signal(false);
  confirmPasswordVisible = signal(false);

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
  }

  toggleNewPasswordVisibility(): void {
    this.newPasswordVisible.update(v => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.confirmPasswordVisible.update(v => !v);
  }

  async onSubmit(): Promise<void> {
    if (!this.token || !this.newPassword || !this.confirmPassword) return;
    await this.facade.resetPassword(this.token, this.newPassword, this.confirmPassword);
  }

  get rules(): PasswordRules {
    return {
      minLength: this.newPassword.length >= 8,
      hasUppercase: /[A-Z]/.test(this.newPassword),
      hasNumber: /[0-9]/.test(this.newPassword),
      hasSpecial: /[!@#$%^&*]/.test(this.newPassword),
    };
  }

  get strengthLevel(): StrengthLevel {
    if (!this.newPassword) return 'none';
    const count = Object.values(this.rules).filter(Boolean).length;
    if (count === 1) return 'weak';
    if (count === 2) return 'fair';
    if (count === 3) return 'strong';
    return 'veryStrong';
  }

  get strengthLabel(): string {
    switch (this.strengthLevel) {
      case 'weak': return 'Débil';
      case 'fair': return 'Moderada';
      case 'strong': return 'Fuerte';
      case 'veryStrong': return 'Muy fuerte';
      default: return '';
    }
  }

  get strengthSegments(): number {
    switch (this.strengthLevel) {
      case 'weak': return 1;
      case 'fair': return 2;
      case 'strong': return 3;
      case 'veryStrong': return 4;
      default: return 0;
    }
  }

  get isSubmitting(): boolean {
    return this.facade.state().resetStatus === 'submitting';
  }

  get hasInvalidToken(): boolean {
    return this.facade.state().resetStatus === 'invalidToken';
  }

  get hasResetError(): boolean {
    return this.facade.state().resetStatus === 'error';
  }
}
