import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { RouterModule, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { AuthService } from './core/auth.service';
import { SessionExpirationDialogComponent } from './core/session-expiration-dialog.component';
import { AuthFacade } from './auth/application/auth.facade';
import { PrimerInicioCambioContrasenaModalComponent } from './auth/primer-inicio-cambio-contrasena-modal.component';
import { SessionDisplacementModalComponent } from './auth/session-displacement-modal.component';
import { AUTH_TOKEN_KEY } from './auth/application/ports/auth-gateway';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, RouterLink, RouterLinkActive, CommonModule, SessionExpirationDialogComponent, PrimerInicioCambioContrasenaModalComponent, SessionDisplacementModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly facade = inject(AuthFacade);

  /** Mobile sidebar drawer — toggled by hamburger button */
  readonly isMobileMenuOpen = signal(false);

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update(v => !v);
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  /** Routes that render without the sidebar + topbar shell */
  private readonly shelllessRoutes = ['/login', '/recuperar-contrasena', '/restablecer-contrasena'];

  private isShellless(url: string): boolean {
    return this.shelllessRoutes.some(route => url.startsWith(route));
  }

  /** Hide the shell (sidebar + topbar) on auth / transactional routes */
  readonly showShell = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map((e: NavigationEnd) => !this.isShellless(e.urlAfterRedirects)),
      startWith(!this.isShellless(this.router.url)),
    ),
    { initialValue: !this.isShellless(this.router.url) },
  );

  /**
   * Dynamic topbar title / breadcrumb per FR-003.
   * Derives the display title from the current route URL.
   */
  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map((e: NavigationEnd) => this.resolveBreadcrumb(e.urlAfterRedirects)),
      startWith(this.resolveBreadcrumb(this.router.url)),
    ),
    { initialValue: this.resolveBreadcrumb(this.router.url) },
  );

  private resolveBreadcrumb(url: string): string {
    if (url.startsWith('/admin/roles-permisos')) return 'Roles & Permisos';
    if (url.startsWith('/audit'))               return 'Auditoria de Sesiones';
    if (url.startsWith('/admin/dashboard'))     return 'Dashboard Administrativo';
    if (url.startsWith('/users'))               return 'Usuarios del Sistema';
    if (url.startsWith('/agents'))              return 'Agentes';
    if (url.startsWith('/operation-types'))     return 'Tipos de Operacion';
    if (url.startsWith('/dashboard'))           return 'Operaciones Financieras';
    return 'Operaciones Financieras';
  }

  /** Expose to template for conditional admin nav item */
  readonly isAdmin = this.auth.isAdmin;

  /** Session expiration dialog state — opens automatically at ≤30 seconds */
  showSessionDialog = signal(false);

  /**
   * True while the 30-second session warning is active — drives the alarm
   * animation on the countdown display in the topbar.
   * Only set by the JWT expiry countdown; NOT by InactivityService.
   */
  isTimerAlarming = signal(false);

  /** Seconds remaining until JWT expires. Updated every second. */
  tokenSecondsLeft = signal<number>(300);

  /** MM:SS formatted countdown string for the topbar display. */
  readonly tokenCountdown = computed(() => {
    const s = Math.max(0, this.tokenSecondsLeft());
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  });

  /** Prevents the modal from firing multiple times per expiry window */
  private alarmFired = false;

  currentTime = signal('');
  currentDate = signal('');
  private clockInterval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  ngOnDestroy(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
  }

  async onSessionContinue(): Promise<void> {
    this.showSessionDialog.set(false);
    this.isTimerAlarming.set(false);
    this.alarmFired = false; // reset so alarm re-fires after next expiry window
    // Renew the JWT — this is the critical call that was missing
    await this.facade.refreshSession();
  }

  onSessionClose(): void {
    this.showSessionDialog.set(false);
    this.isTimerAlarming.set(false);
    this.alarmFired = false;
    this.facade.logout();
  }

  triggerSessionDialog(): void {
    this.showSessionDialog.set(true);
    this.isTimerAlarming.set(true);
  }

  /** Controls the name tooltip — only true when name is actually truncated. */
  showTooltip = false;

  /** Show tooltip only when the text overflows (has ellipsis). */
  checkTruncation(el: HTMLElement): void {
    this.showTooltip = el.scrollWidth > el.offsetWidth;
  }

  /** Compute 2-letter initials: first letter of first word + first letter of last word. */
  getInitials(displayName: string | null | undefined): string {
    if (!displayName) return 'U';
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  private updateClock(): void {
    const now = new Date();
    this.currentTime.set(now.toLocaleTimeString('es-ES', { hour12: false }));
    this.currentDate.set(
      now
        .toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase()
        .replace('.', '')
    );

    // ── Token countdown ──────────────────────────────────────────────────────
    const expiresAt = this.readExpiresAtFromToken();
    if (expiresAt !== null) {
      const secondsLeft = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
      this.tokenSecondsLeft.set(secondsLeft);

      // Trigger alarm + modal at EXACTLY ≤30 seconds remaining
      if (secondsLeft > 0 && secondsLeft <= 30 && !this.alarmFired) {
        this.alarmFired = true;
        this.isTimerAlarming.set(true);
        this.showSessionDialog.set(true);
      }

      // Clear alarm when expired
      if (secondsLeft === 0) {
        this.isTimerAlarming.set(false);
      }
    }
  }

  /** Read the JWT exp claim (seconds since epoch) from localStorage. */
  private readExpiresAtFromToken(): number | null {
    try {
      const token = typeof localStorage !== 'undefined'
          ? localStorage.getItem(AUTH_TOKEN_KEY)
          : null;
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
      return null;
    }
  }
}
