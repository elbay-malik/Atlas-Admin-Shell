import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ATLAS_API_MODE, AtlasApiMode } from '@atlas/shared-util';
import { AuditStore } from '../data/audit.store';
import { AuditHome } from './audit-home';

async function render(apiMode: AtlasApiMode): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [AuditHome],
    providers: [
      { provide: ATLAS_API_MODE, useValue: apiMode },
      {
        provide: AuditStore,
        useValue: {
          entities: signal([]),
          filtered: signal([]),
          query: signal(''),
          error: signal(null),
          isPending: signal(false),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AuditHome);
  await fixture.whenStable();
  return fixture.nativeElement;
}

describe('AuditHome', () => {
  it('says the mock trail lives in this tab and clears on reload', async () => {
    const el = await render('mock');
    expect(el.querySelector('[data-testid="audit-in-memory"]')?.textContent).toContain(
      'lives in this tab and clears on reload'
    );
  });

  it('does not say so when an edge is keeping the trail', async () => {
    const el = await render('http');
    expect(el.querySelector('[data-testid="audit-in-memory"]')).toBeNull();
  });
});
