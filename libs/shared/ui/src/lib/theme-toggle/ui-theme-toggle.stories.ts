import { type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { UiThemeToggle } from './ui-theme-toggle';

/**
 * ThemeService is providedIn root and writes the `dark` class onto
 * <html> plus localStorage; the global preview decorator resets both between
 * stories so Light always starts light.
 */
const meta: Meta<UiThemeToggle> = {
  title: 'Shared UI/Theme toggle',
  component: UiThemeToggle,
  tags: ['autodocs'],
  render: () => ({ template: `<ui-theme-toggle />` }),
};
export default meta;

type Story = StoryObj<UiThemeToggle>;

export const Light: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAccessibleName('Switch to dark theme');
  },
};

export const TogglesToDark: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button');
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(document.documentElement).toHaveClass('dark');
  },
};
