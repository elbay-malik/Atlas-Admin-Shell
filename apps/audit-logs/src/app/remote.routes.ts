import { Routes } from '@angular/router';
import { AuditApi } from './data/audit-api';
import { AuditStore } from './data/audit.store';

export const remoteRoutes: Routes = [
  {
    path: '',
    // Route-level providers: this remote owns the API + store instance. The
    // router caches the lazy injector, so the trail (including bus-ingested
    // rows) survives navigating away and back (ADR-0005).
    providers: [AuditApi, AuditStore],
    loadComponent: () => import('./audit-home/audit-home').then((m) => m.AuditHome),
  },
];
