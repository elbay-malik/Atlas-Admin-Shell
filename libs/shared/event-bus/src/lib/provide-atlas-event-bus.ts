import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { ATLAS_EVENT_BUS_CONFIG, AtlasEventBus, AtlasEventBusConfig } from './atlas-event-bus';
import { ReplayAtlasEventBus } from './replay-atlas-event-bus';

const DEFAULT_CONFIG: AtlasEventBusConfig = { bufferSize: 200 };

/**
 * Installs the bus. Only the HOST calls this — remotes just inject
 * AtlasEventBus and receive the shell's singleton via federation sharing.
 */
export function provideAtlasEventBus(
  config: Partial<AtlasEventBusConfig> = {}
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ATLAS_EVENT_BUS_CONFIG, useValue: { ...DEFAULT_CONFIG, ...config } },
    { provide: AtlasEventBus, useClass: ReplayAtlasEventBus },
  ]);
}
