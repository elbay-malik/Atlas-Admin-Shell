import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiActionStatus, UiActionStatusValue, actionStatusLifetime } from './ui-action-status';

const UNDOABLE: UiActionStatusValue = {
  message: 'Alan Turing deactivated.',
  undoable: true,
  supersedes: null,
};

@Component({
  imports: [UiActionStatus],
  template: `<ui-action-status [status]="status()" (expired)="expired = expired + 1" />`,
})
class Host {
  readonly status = signal<UiActionStatusValue | null>(null);
  expired = 0;
}

describe('UiActionStatus', () => {
  let fixture: ComponentFixture<Host>;
  const el = () => fixture.nativeElement as HTMLElement;
  const region = () => el().querySelector<HTMLElement>('[data-testid="action-status"]') as HTMLElement;
  const undoButton = () => region().querySelector<HTMLButtonElement>('button');

  async function show(status: UiActionStatusValue | null): Promise<void> {
    fixture.componentInstance.status.set(status);
    await TestBed.tick();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(el());
    await TestBed.tick();
  });

  afterEach(() => {
    el().remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the region and the Undo slot mounted while silent', () => {
    expect(region().getAttribute('role')).toBe('status');
    expect(region().textContent?.trim()).toBe('');
    expect(region().querySelector('[data-testid="action-status-undo-slot"]')).not.toBeNull();
    expect(undoButton()).toBeNull();
  });

  it('offers Undo only when there is something to undo', async () => {
    await show(UNDOABLE);
    expect(undoButton()?.getAttribute('aria-label')).toBe('Undo: Alan Turing deactivated.');

    await show({ ...UNDOABLE, message: 'Undone: Alan Turing deactivated.', undoable: false });
    expect(region().textContent).toContain('Undone');
    expect(undoButton()).toBeNull();
  });

  it('says when a change has taken over from an earlier Undo', async () => {
    await show({ ...UNDOABLE, supersedes: 'Grace Hopper deactivated.' });

    expect(region().querySelector('[data-testid="action-status-superseded"]')?.textContent).toBe(
      '"Grace Hopper deactivated" can no longer be undone here; reverse it in its row.'
    );
  });

  it('gives Undo longer than a plain acknowledgement, and longer text more time', () => {
    const plain = { ...UNDOABLE, undoable: false };
    expect(actionStatusLifetime(UNDOABLE)).toBeGreaterThan(actionStatusLifetime(plain));
    expect(actionStatusLifetime({ ...UNDOABLE, supersedes: 'Grace Hopper deactivated.' })).toBeGreaterThan(
      actionStatusLifetime(UNDOABLE)
    );
  });

  it('expires once, at the end of its lifetime', async () => {
    await show(UNDOABLE);

    await vi.advanceTimersByTimeAsync(actionStatusLifetime(UNDOABLE) - 500);
    expect(fixture.componentInstance.expired).toBe(0);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fixture.componentInstance.expired).toBe(1);
  });

  it('restarts the clock for a new status, even with the same words', async () => {
    await show(UNDOABLE);
    await vi.advanceTimersByTimeAsync(actionStatusLifetime(UNDOABLE) - 500);

    await show({ ...UNDOABLE });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fixture.componentInstance.expired).toBe(0);
  });

  it('does not run the clock while keyboard focus is on the line', async () => {
    await show(UNDOABLE);
    undoButton()?.focus();

    await vi.advanceTimersByTimeAsync(actionStatusLifetime(UNDOABLE) * 3);
    expect(fixture.componentInstance.expired).toBe(0);

    undoButton()?.blur();
    await vi.advanceTimersByTimeAsync(actionStatusLifetime(UNDOABLE));
    expect(fixture.componentInstance.expired).toBe(1);
  });

  it('does not run the clock while the tab is hidden', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await show(UNDOABLE);

    await vi.advanceTimersByTimeAsync(actionStatusLifetime(UNDOABLE) * 3);
    expect(fixture.componentInstance.expired).toBe(0);

    hidden.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(actionStatusLifetime(UNDOABLE));
    expect(fixture.componentInstance.expired).toBe(1);
  });

  it('stops the clock when the status clears', async () => {
    await show(UNDOABLE);
    await show(null);

    await vi.advanceTimersByTimeAsync(actionStatusLifetime(UNDOABLE) * 2);
    expect(fixture.componentInstance.expired).toBe(0);
  });
});
