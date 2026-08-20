import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthFacade } from './application/auth.facade';
import { InactivityService } from '../core/inactivity.service';

/**
 * SessionExpiryModalComponent — Session expiration warning modal
 * Pixel-perfect per mockup screen 16 (16-aviso-expiracion-sesion).
 *
 * Subscribes to InactivityService.sessionExpiring$ and shows a 30-second
 * countdown. Offers "Cerrar sesión" and "Continuar sesión" actions.
 *
 * FR-021: Modal overlays entire screen with blurred, non-interactive background
 * FR-022: Only the two modal buttons are clickable while modal is visible
 * FR-023: "Continuar sesión" renews session and resets inactivity timer
 * FR-024: "Cerrar sesión" / countdown=0 terminates session
 */
@Component({
  selector: 'app-session-expiry-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session-expiry-modal.component.html',
  styleUrls: ['./session-expiry-modal.component.scss'],
})
export class SessionExpiryModalComponent implements OnInit, OnDestroy {
  private readonly facade = inject(AuthFacade);
  private readonly inactivity = inject(InactivityService);

  isVisible = signal(false);
  secondsRemaining = signal(30);

  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private sub: Subscription | null = null;

  ngOnInit(): void {
    this.sub = this.inactivity.sessionExpiring$.subscribe(() => {
      this.showModal();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.stopCountdown();
  }

  async continueSession(): Promise<void> {
    this.hideModal();
    await this.facade.refreshSession();
    this.inactivity.resetTimer();
    this.inactivity.start();
  }

  async closeSession(): Promise<void> {
    this.hideModal();
    await this.facade.logout();
  }

  get formattedTime(): string {
    const s = this.secondsRemaining();
    return `00:${s.toString().padStart(2, '0')}`;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private showModal(): void {
    this.secondsRemaining.set(30);
    this.isVisible.set(true);
    this.startCountdown();
  }

  private hideModal(): void {
    this.isVisible.set(false);
    this.stopCountdown();
  }

  private startCountdown(): void {
    this.stopCountdown(); // safety: no double intervals
    this.countdownInterval = setInterval(async () => {
      const remaining = this.secondsRemaining() - 1;
      this.secondsRemaining.set(remaining);
      if (remaining <= 0) {
        await this.closeSession();
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }
}
