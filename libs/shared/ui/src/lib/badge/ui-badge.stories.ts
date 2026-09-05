import { argsToTemplate, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { UiBadge } from './ui-badge';

const meta: Meta<UiBadge> = {
  title: 'Shared UI/Badge',
  component: UiBadge,
  tags: ['autodocs'],
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'success', 'warning', 'danger'],
      description: 'Semantic tone; colours come from the design tokens, never raw hex.',
    },
  },
  args: { tone: 'neutral' },
  render: (args) => ({
    props: args,
    template: `<ui-badge ${argsToTemplate(args)}>viewer</ui-badge>`,
  }),
};
export default meta;

type Story = StoryObj<UiBadge>;

export const Neutral: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('viewer')).toBeVisible();
  },
};

export const Success: Story = {
  args: { tone: 'success' },
  render: (args) => ({ props: args, template: `<ui-badge ${argsToTemplate(args)}>admin</ui-badge>` }),
};

export const Warning: Story = {
  args: { tone: 'warning' },
  render: (args) => ({ props: args, template: `<ui-badge ${argsToTemplate(args)}>degraded</ui-badge>` }),
};

export const Danger: Story = {
  args: { tone: 'danger' },
  render: (args) => ({ props: args, template: `<ui-badge ${argsToTemplate(args)}>offline</ui-badge>` }),
};

/**
 * Every tone in dark mode. The tinted background and its ink token both flip
 * per theme, so a tone can clear AA in light and fail in dark — axe has to see
 * both. This is the pairing that caught the original 3.65:1 badge bug.
 */
export const AllTonesDark: Story = {
  parameters: { theme: 'dark' },
  render: () => ({
    template: `
      <div class="flex gap-2 p-4">
        <ui-badge tone="neutral">viewer</ui-badge>
        <ui-badge tone="success">admin</ui-badge>
        <ui-badge tone="warning">degraded</ui-badge>
        <ui-badge tone="danger">offline</ui-badge>
      </div>`,
  }),
};

/** The same row in light mode, so the two are reviewed side by side. */
export const AllTones: Story = {
  render: () => ({
    template: `
      <div class="flex gap-2 p-4">
        <ui-badge tone="neutral">viewer</ui-badge>
        <ui-badge tone="success">admin</ui-badge>
        <ui-badge tone="warning">degraded</ui-badge>
        <ui-badge tone="danger">offline</ui-badge>
      </div>`,
  }),
};
