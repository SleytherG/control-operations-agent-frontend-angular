import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type ConflictDialogResult = 'reedit' | 'cancel';

@Component({
  selector: 'app-conflict-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './conflict-dialog.component.html',
  styleUrl: './conflict-dialog.component.scss',
})
export class ConflictDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ConflictDialogComponent, ConflictDialogResult>);

  onReedit(): void {
    this.dialogRef.close('reedit');
  }

  onCancel(): void {
    this.dialogRef.close('cancel');
  }
}
