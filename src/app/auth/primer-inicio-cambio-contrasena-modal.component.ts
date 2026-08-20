import { Component, computed, signal, inject, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { AuthFacade } from './application/auth.facade';

/**
 * Mandatory first-login password change modal (spec 015, FR-001, FR-002, FR-017).
 *
 * Shown when AuthFacade.state().mustChangePassword === true AND the user is authenticated.
 * Blocks all navigation until the password change completes successfully (FR-002).
 * Mounted at AppComponent level so it covers the entire application shell.
 *
 * Accessibility (FR-018, SC-008):
 * - role="dialog" + aria-modal="true" on the container
 * - aria-labelledby pointing to the modal title
 * - Focus trap handled in the template via cdkTrapFocus (Angular CDK)
 * - Requirement indicators communicate state via icon + text, not color alone
 * - aria-live="polite" for backend error messages
 */
@Component({
  selector: 'app-primer-inicio-cambio-contrasena-modal',
  standalone: true,
  imports: [CommonModule, A11yModule],
  templateUrl: './primer-inicio-cambio-contrasena-modal.component.html',
  styleUrl: './primer-inicio-cambio-contrasena-modal.component.scss',
})
export class PrimerInicioCambioContrasenaModalComponent {
  readonly facade = inject(AuthFacade);

  // ─── Form field values ────────────────────────────────────────────────────
  readonly temporaryPassword = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');

  // ─── Visibility toggles ───────────────────────────────────────────────────
  readonly showTempPassword = signal(false);
  readonly showNewPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  // ─── Password requirement indicators (FR-005) ─────────────────────────────
  readonly hasMinLength = computed(() => this.newPassword().length >= 8);
  readonly hasUppercase = computed(() => /[A-Z]/.test(this.newPassword()));
  readonly hasNumber = computed(() => /[0-9]/.test(this.newPassword()));
  readonly hasSpecial = computed(() => /[!@#$%^&*]/.test(this.newPassword()));

  readonly allRequirementsMet = computed(
    () =>
      this.hasMinLength() &&
      this.hasUppercase() &&
      this.hasNumber() &&
      this.hasSpecial(),
  );

  // ─── Confirm match ────────────────────────────────────────────────────────
  readonly confirmMatches = computed(
    () =>
      this.confirmPassword().length > 0 &&
      this.newPassword() === this.confirmPassword(),
  );

  // ─── Submit disabled state (FR-006, FR-007, FR-008) ──────────────────────
  readonly isSubmitDisabled = computed(
    () =>
      !this.temporaryPassword() ||
      !this.newPassword() ||
      !this.confirmPassword() ||
      !this.allRequirementsMet() ||
      !this.confirmMatches() ||
      this.facade.state().changePasswordStatus === 'submitting',
  );

  readonly isSubmitting = computed(
    () => this.facade.state().changePasswordStatus === 'submitting',
  );

  // ─── Error message (FR-010, FR-011) ──────────────────────────────────────
  readonly errorMessage = computed(() => {
    const err = this.facade.state().changePasswordError;
    switch (err) {
      case 'invalidTempPassword':
        return 'La contraseña temporal ingresada es incorrecta. Verifique el correo de bienvenida e intente nuevamente.';
      case 'weakPassword':
        return 'La nueva contraseña no cumple los requisitos de seguridad.';
      case 'sameAsTemporary':
        return 'La nueva contraseña no puede ser igual a la contraseña temporal.';
      case 'network':
        return 'No se pudo procesar el cambio. Verifique su conexión e intente nuevamente.';
      default:
        return null;
    }
  });

  // ─── Actions ─────────────────────────────────────────────────────────────

  onTemporaryPasswordInput(event: Event): void {
    this.temporaryPassword.set((event.target as HTMLInputElement).value);
  }

  onNewPasswordInput(event: Event): void {
    this.newPassword.set((event.target as HTMLInputElement).value);
  }

  onConfirmPasswordInput(event: Event): void {
    this.confirmPassword.set((event.target as HTMLInputElement).value);
  }

  toggleTempVisibility(): void {
    this.showTempPassword.update(v => !v);
  }

  toggleNewVisibility(): void {
    this.showNewPassword.update(v => !v);
  }

  toggleConfirmVisibility(): void {
    this.showConfirmPassword.update(v => !v);
  }

  async onSubmit(): Promise<void> {
    if (this.isSubmitDisabled()) return;
    await this.facade.changeFirstLoginPassword(
      this.temporaryPassword(),
      this.newPassword(),
      this.confirmPassword(),
    );
  }
}
