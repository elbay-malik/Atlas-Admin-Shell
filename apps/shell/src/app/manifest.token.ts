import { InjectionToken } from '@angular/core';
import { AtlasManifest } from '@atlas/shared-contracts';

/** The manifest fetched at bootstrap; provided once in bootstrap.ts. */
export const ATLAS_MANIFEST = new InjectionToken<AtlasManifest>('ATLAS_MANIFEST');
