import { Provider } from '@angular/core';
import { ATLAS_API_MODE, AtlasApiMode } from '@atlas/shared-util';
import { IamApi, IamHttpApi, IamMockApi } from './iam-api';

/**
 * Binds the domain's API contract to whichever implementation the shell
 * selected. The token is imported from @atlas/shared-util rather than declared
 * here: a locally declared token would be a different object, so the shell's
 * choice would never reach this remote.
 */
export function provideIamApi(): Provider[] {
  return [
    IamMockApi,
    IamHttpApi,
    {
      provide: IamApi,
      useFactory: (mode: AtlasApiMode, mock: IamMockApi, http: IamHttpApi) =>
        mode === 'http' ? http : mock,
      deps: [ATLAS_API_MODE, IamMockApi, IamHttpApi],
    },
  ];
}
