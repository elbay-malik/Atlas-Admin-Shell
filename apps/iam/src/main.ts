import { initFederation } from '@angular-architects/native-federation-v4';

initFederation({ iam: './remoteEntry.json' })
  .catch((err) => console.error(err))
  // bootstrap even if federation init failed, so the remote still runs standalone
  .then(() => import('./bootstrap'))
  .catch((err) => console.error(err));
