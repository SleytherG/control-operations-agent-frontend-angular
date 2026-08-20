import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';

/**
 * Custom DateAdapter that overrides the display format for MatDatepicker inputs
 * to always render dates as DD/MM/YYYY (with leading-zero padding on day and month).
 *
 * The default NativeDateAdapter uses Intl.DateTimeFormat which — depending on the
 * locale — may omit leading zeros (e.g. "1/08/2026" instead of "01/08/2026").
 * This adapter enforces a consistent DD/MM/YYYY display across all browsers.
 */
@Injectable()
export class AppDateAdapter extends NativeDateAdapter {
  override format(date: Date, _displayFormat: object): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}
