import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ConflictDialogComponent } from './conflict-dialog.component';

describe('ConflictDialogComponent', () => {
  const setupComponent = () => {
    const dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ConflictDialogComponent, NoopAnimationsModule],
      providers: [{ provide: MatDialogRef, useValue: dialogRef }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConflictDialogComponent);
    fixture.detectChanges();
    return { fixture, dialogRef };
  };

  // ---- Warning message visible ----

  it('displays the concurrent modification warning message', () => {
    const { fixture } = setupComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const message = compiled.querySelector('[data-testid="conflict-dialog-message"]');
    expect(message).not.toBeNull();
    expect(message?.textContent).toContain('modificada por otro operador');
  });

  // ---- "Re-editar" button closes with 'reedit' ----

  it('onReedit closes dialog with "reedit"', () => {
    const { fixture, dialogRef } = setupComponent();
    fixture.componentInstance.onReedit();
    expect(dialogRef.close).toHaveBeenCalledWith('reedit');
  });

  // ---- "Cancelar" button closes with 'cancel' ----

  it('onCancel closes dialog with "cancel"', () => {
    const { fixture, dialogRef } = setupComponent();
    fixture.componentInstance.onCancel();
    expect(dialogRef.close).toHaveBeenCalledWith('cancel');
  });

  // ---- Buttons are rendered ----

  it('renders Re-editar and Cancelar buttons', () => {
    const { fixture } = setupComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const reeditBtn = compiled.querySelector('[data-testid="conflict-btn-reedit"]');
    const cancelBtn = compiled.querySelector('[data-testid="conflict-btn-cancel"]');
    expect(reeditBtn).not.toBeNull();
    expect(cancelBtn).not.toBeNull();
  });
});
