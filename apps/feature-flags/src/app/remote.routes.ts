import { Routes } from '@angular/router';
import { provideFlagsApi } from './data/api-mode';
import { FlagsStore } from './data/flags.store';

export const remoteRoutes: Routes = [
  {
    path: '',
    // Route-level providers: the remote owns the API + store instance, and the
    // router caches this lazy injector so state survives navigation away and
    // back. Nothing is providedIn 'root', so nothing leaks into the shell.
    providers: [...provideFlagsApi(), FlagsStore],
    loadComponent: () => import('./flags-home/flags-home').then((m) => m.FlagsHome),
  },
];
