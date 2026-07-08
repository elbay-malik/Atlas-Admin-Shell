import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('toggles the dark class on the document element', async () => {
    const service = TestBed.inject(ThemeService);
    const initial = service.dark();
    service.toggle();
    await TestBed.tick();
    expect(service.dark()).toBe(!initial);
    expect(document.documentElement.classList.contains('dark')).toBe(!initial);
  });

  it('persists the choice', async () => {
    const service = TestBed.inject(ThemeService);
    service.dark.set(true);
    await TestBed.tick();
    expect(localStorage.getItem('atlas.theme')).toBe('dark');
  });
});
