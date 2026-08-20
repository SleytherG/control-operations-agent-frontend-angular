import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors, withInterceptorsFromDi } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { authHttpInterceptor } from './core/auth-http.interceptor';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { AppDateAdapter } from './core/app-date-adapter';
import { OPERATIONS_GATEWAY } from './operations/application/ports/operations-gateway';
import { PENDING_CONFIRMATION_STORE } from './operations/application/ports/pending-confirmation-store';
import { OperationsHttpGateway } from './operations/adapters/out/http/operations-http.gateway';
import { BrowserPendingConfirmationStore } from './operations/adapters/out/storage/browser-pending-confirmation.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // withInterceptors registers the functional authHttpInterceptor (JWT attachment + 401 redirect)
    // withInterceptorsFromDi retained for any legacy DI-based interceptors that may already exist
    provideHttpClient(withInterceptors([authHttpInterceptor]), withInterceptorsFromDi()),
    provideAnimationsAsync(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // Bind gateway and store ports to their concrete implementations
    { provide: OPERATIONS_GATEWAY, useClass: OperationsHttpGateway },
    { provide: PENDING_CONFIRMATION_STORE, useClass: BrowserPendingConfirmationStore },
    // Global Material Dialog defaults: no backdrop-click close (FR-016), consistent width
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: { disableClose: true, autoFocus: 'first-tabbable', width: '480px' },
    },
    // Spanish (Peru) locale for Material Datepicker inputs (feature 005 — FR-005)
    { provide: MAT_DATE_LOCALE, useValue: 'es-PE' },
    // Custom date adapter: always displays dates as DD/MM/YYYY with leading zeros
    { provide: DateAdapter, useClass: AppDateAdapter },
  ],
};
