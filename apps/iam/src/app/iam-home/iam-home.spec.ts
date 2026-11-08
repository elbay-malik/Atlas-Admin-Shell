import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AtlasAuth, MockAtlasAuth } from '@atlas/shared-auth';
import { provideAtlasEventBus } from '@atlas/shared-event-bus';
import { IamApi, IamMockApi } from '../data/iam-api';
import { IamUsersStore } from '../data/iam-users.store';
import { IamHome } from './iam-home';

const GET_USERS_MS = 300;
const WRITE_MS = 200;

describe('IamHome', () => {
  let fixture: ComponentFixture<IamHome>;
  const el = () => fixture.nativeElement as HTMLElement;
  const row = (id: string) =>
    el().querySelector<HTMLElement>(`[data-testid="user-row"][data-user-id="${id}"]`) as HTMLElement;
  const toggle = (id: string) =>
    row(id).querySelector<HTMLButtonElement>('[data-testid="toggle-active"] button') as HTMLButtonElement;
  const select = (id: string) =>
    row(id).querySelector<HTMLSelectElement>('[data-testid="role-select"]') as HTMLSelectElement;
  const status = () => el().querySelector('[data-testid="action-status"]') as HTMLElement;
  const text = (testId: string) => el().querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();

  async function settle(ms = WRITE_MS): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    await TestBed.tick();
  }

  beforeEach(async () => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [IamHome],
      providers: [
        provideAtlasEventBus(),
        { provide: AtlasAuth, useClass: MockAtlasAuth },
        { provide: IamApi, useClass: IamMockApi },
        IamUsersStore,
      ],
    });
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('admin');
    fixture = TestBed.createComponent(IamHome);
    document.body.appendChild(el());
    await settle(GET_USERS_MS);
  });

  afterEach(() => {
    el().remove();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('agrees with itself about administrators after one is deactivated', async () => {
    expect(text('admin-count')).toBe('2 active admins');

    toggle('u-2').click();
    await settle();

    expect(text('admin-count')).toBe('1 active admin');
    // Grace's role is not locked as "the last administrator": she is not one.
    expect(select('u-2').disabled).toBe(false);
    expect(row('u-2').textContent).not.toContain('last administrator');
  });

  it('writes refusal reasons beside the control, with no tooltip to find', async () => {
    const self = row('u-1');

    expect(select('u-1').disabled).toBe(true);
    expect(toggle('u-1').disabled).toBe(true);
    expect(self.querySelector('[data-testid="role-refusal"]')?.textContent).toContain('your own admin role');
    expect(self.querySelector('[data-testid="active-refusal"]')?.textContent).toContain('signed in with');
    expect(select('u-1').getAttribute('aria-describedby')).toBe(
      self.querySelector('[data-testid="role-refusal"]')?.id
    );
    expect(self.querySelector('[title]')).toBeNull();

    expect(row('u-3').querySelector('[data-testid="active-refusal"]')).toBeNull();
    expect(row('u-3').querySelector('[data-testid="role-refusal"]')).toBeNull();
  });

  it('gives Deactivate more weight than Activate, unless it is refused', () => {
    expect(toggle('u-3').className).toContain('text-on-danger');
    expect(toggle('u-4').className).not.toContain('text-on-danger');
    expect(toggle('u-1').className).not.toContain('text-on-danger');
  });

  it('returns focus to the control that made the change after Undo', async () => {
    toggle('u-3').click();
    await settle();
    const undo = status().querySelector('button') as HTMLButtonElement;
    undo.focus();
    undo.click();
    await TestBed.tick();
    expect(document.activeElement).toBe(toggle('u-3'));
    await settle();

    select('u-4').value = 'admin';
    select('u-4').dispatchEvent(new Event('change'));
    await settle();
    (status().querySelector('button') as HTMLButtonElement).click();
    await TestBed.tick();
    expect(document.activeElement).toBe(select('u-4'));
  });

  it('puts the select back when a second change arrives while the first is in flight', async () => {
    select('u-4').value = 'admin';
    select('u-4').dispatchEvent(new Event('change'));
    await TestBed.tick();
    expect(row('u-4').dataset['pending']).toBe('true');

    select('u-4').value = 'viewer';
    select('u-4').dispatchEvent(new Event('change'));
    await TestBed.tick();
    expect(select('u-4').value).toBe('admin');

    await settle();
    expect(select('u-4').value).toBe('admin');
    expect(TestBed.inject(IamUsersStore).entityMap()['u-4']?.role).toBe('admin');
  });

  it('puts the select back when a signed-out change is refused', async () => {
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).logout();
    await TestBed.tick();

    select('u-4').value = 'admin';
    select('u-4').dispatchEvent(new Event('change'));
    await settle();

    expect(select('u-4').value).toBe('viewer');
    expect(TestBed.inject(IamUsersStore).entityMap()['u-4']?.role).toBe('viewer');
  });

  it('stops offering Undo after undoing, and keeps the slot', async () => {
    toggle('u-3').click();
    await settle();
    (status().querySelector('button') as HTMLButtonElement).click();
    await settle();

    expect(status().textContent).toContain('Undone: Alan Turing deactivated.');
    expect(status().querySelector('button')).toBeNull();
    expect(status().querySelector('[data-testid="action-status-undo-slot"]')).not.toBeNull();
  });

  it('says when a second change takes over from the first Undo', async () => {
    toggle('u-3').click();
    await settle();
    toggle('u-4').click();
    await settle();

    expect(text('action-status-superseded')).toContain('"Alan Turing deactivated" can no longer be undone');
  });

  it('clears the message and its Undo when the line expires', async () => {
    toggle('u-3').click();
    await settle();
    await settle(60_000);

    expect(status().textContent?.trim()).toBe('');
  });
});
