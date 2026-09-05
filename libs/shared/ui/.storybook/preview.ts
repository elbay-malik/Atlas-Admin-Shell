import type { Preview } from '@storybook/angular';

/**
 * Stories opt into dark mode with `parameters: { theme: 'dark' }`. This matters
 * for the axe gate: the design tokens flip per theme, and a colour can clear AA
 * in light mode while failing in dark. A blanket "always light" reset used to
 * hide exactly that class of bug.
 */
const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    // 'error' fails the story in the Storybook UI and in the test-runner (CI gate).
    a11y: { test: 'error' },
    controls: { expanded: true },
    theme: 'light',
  },
  decorators: [
    (story, context) => {
      const dark = context.parameters['theme'] === 'dark';
      try {
        // ThemeService persists the choice; clear it so a story never inherits
        // the previous one, then set the theme this story asked for.
        localStorage.removeItem('atlas.theme');
      } catch {
        // storage unavailable — nothing to reset
      }
      document.documentElement.classList.toggle('dark', dark);
      document.body.style.backgroundColor = 'var(--atlas-color-bg)';
      document.body.style.color = 'var(--atlas-color-text)';
      return story();
    },
  ],
};

export default preview;
