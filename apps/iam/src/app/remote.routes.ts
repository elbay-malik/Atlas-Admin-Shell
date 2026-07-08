import { Routes } from '@angular/router';

export const remoteRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./iam-home/iam-home').then((m) => m.IamHome),
  },
];
