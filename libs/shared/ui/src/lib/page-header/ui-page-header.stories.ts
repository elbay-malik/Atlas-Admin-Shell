import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular';
import { UiActionStatus } from '../action-status/ui-action-status';
import { UiBadge } from '../badge/ui-badge';
import { UiPageHeader } from './ui-page-header';

const meta: Meta<UiPageHeader> = {
  title: 'Shared UI/Page Header',
  component: UiPageHeader,
  tags: ['autodocs'],
  decorators: [moduleMetadata({ imports: [UiBadge, UiActionStatus] })],
};
export default meta;

type Story = StoryObj<UiPageHeader>;

const ACKNOWLEDGED = { message: 'bulk-export turned on.', undoable: true, supersedes: null };

/** At rest: the status region is in the DOM, silent, beside the title block. */
export const Default: Story = {
  render: () => ({
    template: `
      <ui-page-header heading="Feature Flags">
        <p>Toggle features for this deployment.</p>
        <ui-badge tone="success">3 of 5 enabled</ui-badge>
        <ui-action-status />
      </ui-page-header>`,
  }),
};

export const WithNoteAndStatus: Story = {
  render: () => ({
    props: { status: ACKNOWLEDGED },
    template: `
      <ui-page-header heading="Feature Flags">
        <p>See which features are on for this deployment.</p>
        <p uiPageNote>Only admins can change feature flags.</p>
        <ui-badge>read-only</ui-badge>
        <ui-badge tone="success">3 of 5 enabled</ui-badge>
        <ui-action-status [status]="status" />
      </ui-page-header>`,
  }),
};

export const WithNoteAndStatusDark: Story = {
  ...WithNoteAndStatus,
  parameters: { theme: 'dark' },
};
