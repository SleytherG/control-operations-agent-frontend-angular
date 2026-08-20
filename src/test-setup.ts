// Global test setup for Vitest + Angular
import { afterEach, beforeAll } from 'vitest';
import { getTestBed, TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

// Initialize Angular test environment once
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
  { teardown: { destroyAfterEach: true } }
);

// Reset TestBed after each test to allow overrideProvider calls in subsequent tests
afterEach(() => {
  TestBed.resetTestingModule();
});
