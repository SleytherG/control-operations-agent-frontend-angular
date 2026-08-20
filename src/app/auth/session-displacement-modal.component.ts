import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, style, animate, transition } from '@angular/animations';
import { AuthFacade } from './application/auth.facade';
import { SESSION_DISPLACEMENT_COUNTDOWN_SECONDS } from '../core/session-displacement.config';

/**
 * Session displacement modal component (spec 017, US1–US3, FR-004, FR-005, FR-007, FR-008, FR-016).
 *
 * Rendered at the AppComponent root level so it persists across page navigation (FR-004).
 * Displays a countdown and closes the session automatically on expiry (FR-007)
 * or immediately when the user acknowledges (FR-008).
 *
 * Message content satisfies FR-016:
 *   (1) Informs the user that another device signed in with the same credentials.
 *   (2) Shows the current countdown value in seconds.
 */
@Component({
  selector: 'app-session-displacement-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session-displacement-modal.component.html',
  styleUrl: './session-displacement-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('backdropFade', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease', style({ opacity: 1 })),
      ]),
      transition(':leave', [
        animate('150ms ease', style({ opacity: 0 })),
      ]),
    ]),
    trigger('dialogScale', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.92)' }),
        animate('250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'scale(1)' })),
      ]),
      transition(':leave', [
        animate('180ms ease-in', style({ opacity: 0, transform: 'scale(0.95)' })),
      ]),
    ]),
  ],
})
export class SessionDisplacementModalComponent implements OnInit, OnDestroy {

  private readonly facade = inject(AuthFacade);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly initialSeconds = inject(SESSION_DISPLACEMENT_COUNTDOWN_SECONDS);

  /** Remaining seconds before automatic session closure (FR-005). */
  remainingSeconds: number;

  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.remainingSeconds = this.initialSeconds;
  }

  ngOnInit(): void {
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  /**
   * Called when the user clicks the acknowledgment button (FR-008).
   * Stops the countdown and immediately closes the session.
   */
  acknowledge(): void {
    this.stopCountdown();
    this.facade.invalidateSession('session_revoked');
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private startCountdown(): void {
    this.stopCountdown();
    this.remainingSeconds = this.initialSeconds;
    this._timer = setInterval(() => {
      this.remainingSeconds--;
      this.cdr.markForCheck();
      if (this.remainingSeconds <= 0) {
        this.stopCountdown();
        // FR-007: countdown reached zero — close session automatically
        this.facade.invalidateSession('session_revoked');
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}
