import { Route } from '@angular/router';
import { ModuleUnavailable } from './module-unavailable/module-unavailable';
import { Overview } from './overview/overview';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: Overview },
  // domain routes are generated from the federation manifest at bootstrap;
  // anything unresolvable degrades gracefully instead of crashing the router
  { path: '**', component: ModuleUnavailable },
];
