import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  trigger,
  style,
  animate,
  transition,
} from '@angular/animations';

@Component({
  selector: 'app-session-expiration-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session-expiration-dialog.component.html',
  styleUrl: './session-expiration-dialog.component.scss',
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
        animate('250ms cubic-bezier(0.34, 1.56, 0.64, 1)', style({ opacity: 1, transform: 'scale(1)' })),
      ]),
      transition(':leave', [
        animate('180ms ease-in', style({ opacity: 0, transform: 'scale(0.95)' })),
      ]),
    ]),
  ],
})
export class SessionExpirationDialogComponent implements OnDestroy, OnChanges {
  /** When true the modal is shown and the countdown starts */
  @Input() visible = false;

  /** Initial countdown in seconds (default 30) */
  @Input() initialSeconds = 30;

  /** Emitted when the user clicks "Continuar sesión" */
  @Output() continueSession = new EventEmitter<void>();

  /** Emitted when the user clicks "Cerrar sesión" or countdown reaches 0 */
  @Output() closeSession = new EventEmitter<void>();

  remainingSeconds = 30;
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this.visible) {
        this.startCountdown();
      } else {
        this.stopCountdown();
      }
    }
    if (changes['initialSeconds'] && this.visible) {
      this.remainingSeconds = this.initialSeconds;
    }
  }

  get formattedTime(): string {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  get isUrgent(): boolean {
    return this.remainingSeconds <= 10;
  }

  onContinue(): void {
    this.stopCountdown();
    this.continueSession.emit();
  }

  onClose(): void {
    this.stopCountdown();
    this.closeSession.emit();
  }

  private startCountdown(): void {
    this.stopCountdown();
    this.remainingSeconds = this.initialSeconds;
    this._timer = setInterval(() => {
      this.remainingSeconds--;
      this.cdr.markForCheck();
      if (this.remainingSeconds <= 0) {
        this.stopCountdown();
        this.closeSession.emit();
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }
}
