import { type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { UiShortId } from './ui-short-id';

const VALUE = '3f6c2a10-7d4e-4b8a-9c21-5e0f7a2c91c6';

const meta: Meta<UiShortId> = {
  title: 'Shared UI/Short ID',
  component: UiShortId,
  tags: ['autodocs'],
  argTypes: {
    value: { control: 'text', description: 'The full identifier.' },
    label: { control: 'text', description: 'What the value is, for screen readers.' },
    align: { control: 'inline-radio', options: ['start', 'end'] },
  },
  args: { value: VALUE, label: 'account ID', align: 'start' },
};
export default meta;

type Story = StoryObj<UiShortId>;

export const Default: Story = {};

/** The full value is reachable with the keyboard alone. */
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByTestId('short-id-value')).toHaveTextContent(VALUE);
  },
};

export const ExpandedDark: Story = {
  parameters: { theme: 'dark' },
  play: Expanded.play,
};
