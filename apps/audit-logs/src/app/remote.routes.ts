import { Routes } from '@angular/router';

export const remoteRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./audit-home/audit-home').then((m) => m.AuditHome),
  },
];
