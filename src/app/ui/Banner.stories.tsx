import type { Meta, StoryObj } from '@storybook/react-vite';
import { Banner } from './Banner';

const meta = {
  title: 'UI/Banner',
  component: Banner,
  args: { children: 'Lobby' },
} satisfies Meta<typeof Banner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Short: Story = {};
export const Long: Story = { args: { children: 'You win! Next round starts in a moment' } };
export const Narrow: Story = {
  args: { children: 'You win! Next round starts in a moment' },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
};
