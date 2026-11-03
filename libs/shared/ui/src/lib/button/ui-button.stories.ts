import { argsToTemplate, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { UiButton } from './ui-button';

/**
 * argTypes are hand-written: this workspace deliberately skips Compodoc (its
 * 2.x depends on the Angular 22 devkit), and Storybook's docgen does not read
 * signal `input()` declarations.
 */
const meta: Meta<UiButton> = {
  title: 'Shared UI/Button',
  component: UiButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'danger-quiet'],
      description:
        'Visual weight. `danger` commits a destructive action; `danger-quiet` offers one that repeats down a list.',
    },
    disabled: { control: 'boolean' },
    pressed: { action: 'pressed', description: 'Emitted on click.' },
  },
  args: { variant: 'primary', disabled: false },
  render: (args) => ({
    props: args,
    template: `<ui-button ${argsToTemplate(args)}>Save changes</ui-button>`,
  }),
};
export default meta;

type Story = StoryObj<UiButton>;

export const Primary: Story = {};

export const Secondary: Story = { args: { variant: 'secondary' } };

export const Danger: Story = {
  args: { variant: 'danger' },
  render: (args) => ({
    props: args,
    template: `<ui-button ${argsToTemplate(args)}>Delete tenant</ui-button>`,
  }),
};

export const DangerQuiet: Story = {
  args: { variant: 'danger-quiet' },
  render: (args) => ({
    props: args,
    template: `<ui-button ${argsToTemplate(args)}>Deactivate</ui-button>`,
  }),
};

/** All variants in dark mode; the fills are theme-invariant, the page is not. */
export const AllVariantsDark: Story = {
  parameters: { theme: 'dark' },
  render: () => ({
    template: `
      <div class="flex gap-2 p-4">
        <ui-button>Save changes</ui-button>
        <ui-button variant="secondary">Cancel</ui-button>
        <ui-button variant="danger">Delete tenant</ui-button>
        <ui-button variant="danger-quiet">Deactivate</ui-button>
      </div>`,
  }),
};

/** A flag's control: off is an ordinary secondary button, on takes the fill. */
export const Toggle: Story = {
  render: () => ({
    template: `
      <div class="flex gap-2 p-4">
        <ui-button variant="secondary" [toggled]="false">Off</ui-button>
        <ui-button variant="secondary" [toggled]="true">On</ui-button>
      </div>`,
  }),
};

export const ToggleDark: Story = { ...Toggle, parameters: { theme: 'dark' } };

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  },
};
