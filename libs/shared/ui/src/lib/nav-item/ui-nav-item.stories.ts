import { provideLocationMocks } from '@angular/common/testing';
import { provideAppInitializer, inject } from '@angular/core';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { applicationConfig, argsToTemplate, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { UiNavItem } from './ui-nav-item';

/**
 * UiNavItem renders a routerLink, so every story needs a Router. The location
 * mocks keep clicks inside the preview iframe instead of navigating it.
 */
const meta: Meta<UiNavItem> = {
  title: 'Shared UI/Nav item',
  component: UiNavItem,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([{ path: '**', children: [] }], withComponentInputBinding()),
        provideLocationMocks(),
      ],
    }),
  ],
  argTypes: {
    link: { control: 'text', description: 'Router link target.' },
    icon: { control: 'text', description: 'Emoji or icon-font token; hidden from assistive tech.' },
    exact: { control: 'boolean', description: 'Match the full URL (use for the "/" overview item).' },
    disabled: { control: 'boolean', description: 'Renders inert with aria-disabled.' },
  },
  args: { link: '/iam', icon: '👥', exact: false, disabled: false },
  render: (args) => ({
    props: args,
    template: `<div class="w-60 p-3"><ui-nav-item ${argsToTemplate(args)}>Identity &amp; Access</ui-nav-item></div>`,
  }),
};
export default meta;

type Story = StoryObj<UiNavItem>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link')).toHaveAttribute('href', '/iam');
  },
};

export const WithoutIcon: Story = { args: { icon: '' } };

/**
 * The current-page state. `routerLinkActive` only applies once the router has
 * actually navigated to the link, so these stories drive the router at startup.
 * Without them the active colours were never in the DOM and the axe gate could
 * not see them — which is exactly how a 2.57:1 active link survived review.
 */
const activeAtIam = applicationConfig({
  providers: [
    provideRouter([{ path: 'iam', children: [] }], withComponentInputBinding()),
    provideLocationMocks(),
    provideAppInitializer(() => inject(Router).navigateByUrl('/iam')),
  ],
});

export const Active: Story = {
  decorators: [activeAtIam],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link')).toHaveClass(/text-on-brand/);
  },
};

/** The same active state in dark mode, where the design tokens flip. */
export const ActiveDark: Story = {
  decorators: [activeAtIam],
  parameters: { theme: 'dark' },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByText('Identity & Access').closest('a');
    await expect(link).toHaveAttribute('aria-disabled', 'true');
  },
};
