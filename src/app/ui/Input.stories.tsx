import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';

const meta = {
  title: 'UI/Input',
  component: Input,
  args: { placeholder: 'Your name', 'aria-label': 'Your name', maxLength: 24 },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { defaultValue: 'worgho2' } };
export const Disabled: Story = { args: { defaultValue: 'worgho2', disabled: true } };
