import { Routes } from '@angular/router';

export const remoteRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./flags-home/flags-home').then((m) => m.FlagsHome),
  },
];
