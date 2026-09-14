import type { Meta, StoryObj } from '@storybook/react-vite';
import { Ribbon } from './Ribbon';

const meta = {
  title: 'UI/Ribbon',
  component: Ribbon,
  args: { children: 'Players' },
  decorators: [
    (Story) => (
      <div style={{ paddingTop: 44 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Ribbon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Short: Story = {};
export const Long: Story = { args: { children: 'You win! Next round starts in a moment' } };
