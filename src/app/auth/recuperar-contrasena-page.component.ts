import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthFacade } from './application/auth.facade';

/**
 * RecuperarContrasenaPageComponent — /recuperar-contrasena route
 * Pixel-perfect per mockup screen 19 (19-recuperar-contrasena-solicitud-v1).
 * FR-014: Displays recovery request form with email field and send button.
 */
@Component({
  selector: 'app-recuperar-contrasena-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './recuperar-contrasena-page.component.html',
  styleUrls: ['./recuperar-contrasena-page.component.scss'],
})
export class RecuperarContrasenaPageComponent implements OnInit {
  protected readonly facade = inject(AuthFacade);
  email = '';

  /** Reset recovery state every time the page is (re-)visited so the form
   *  shows fresh — not the stale 'sent' banner from a previous session. */
  ngOnInit(): void {
    this.facade.resetRecoveryStatus();
    this.email = '';
  }

  async onSubmit(): Promise<void> {
    if (!this.email.trim()) return;
    await this.facade.requestRecovery(this.email);
  }

  get isSending(): boolean {
    return this.facade.state().recoveryStatus === 'sending';
  }

  get isSent(): boolean {
    return this.facade.state().recoveryStatus === 'sent';
  }

  get hasDeliveryError(): boolean {
    return this.facade.state().recoveryStatus === 'deliveryError';
  }

  get hasRateLimit(): boolean {
    return this.facade.state().errorType === 'rateLimit';
  }
}
