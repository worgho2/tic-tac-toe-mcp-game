import type { Meta, StoryObj } from '@storybook/react-vite';
import { Overlay } from './Overlay';

const meta = {
  title: 'UI/Overlay',
  component: Overlay,
  // The overlay is absolutely positioned; give it a board-sized stage to sit on.
  decorators: [
    (Story) => (
      <div className="board-wrap" style={{ width: 224, height: 224, background: 'rgba(0,0,0,0.1)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Overlay>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Win: Story = { args: { outcome: 'win' } };
export const Loss: Story = { args: { outcome: 'loss' } };
export const Draw: Story = { args: { outcome: 'draw' } };
