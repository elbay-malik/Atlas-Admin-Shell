import { toAtlasActor } from './claims';
import { flagToggled, isAtlasEvent } from './events';

describe('toAtlasActor', () => {
  it('prefers the email', () => {
    expect(toAtlasActor({ id: 'u-1', email: 'ada@atlas.dev' })).toBe('ada@atlas.dev');
  });

  it('uses the id when the email is blank, which is how a missing claim arrives', () => {
    expect(toAtlasActor({ id: 'u-1', email: '' })).toBe('u-1');
  });

  it('produces an actor the event contract accepts, where a blank one is rejected', () => {
    const event = (actor: string) =>
      flagToggled({ key: 'k', enabled: true }, { source: 'feature-flags', actor });

    expect(isAtlasEvent(event(toAtlasActor({ id: 'u-1', email: '' })))).toBe(true);
    expect(isAtlasEvent(event(''))).toBe(false);
  });
});
