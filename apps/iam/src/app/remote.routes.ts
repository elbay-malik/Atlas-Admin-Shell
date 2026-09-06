import { Routes } from '@angular/router';
import { provideIamApi } from './data/api-mode';
import { IamUsersStore } from './data/iam-users.store';

export const remoteRoutes: Routes = [
  {
    path: '',
    // Route-level providers: the remote owns the API + store instance, and the
    // router caches this lazy injector so state survives navigation away and
    // back. Nothing is providedIn 'root', so nothing leaks into the shell.
    providers: [...provideIamApi(), IamUsersStore],
    loadComponent: () => import('./iam-home/iam-home').then((m) => m.IamHome),
  },
];
