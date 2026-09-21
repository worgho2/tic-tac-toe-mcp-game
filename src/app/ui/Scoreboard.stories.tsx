import type { Meta, StoryObj } from '@storybook/react-vite';
import { Scoreboard } from './Scoreboard';

const meta = {
  title: 'UI/Scoreboard',
  component: Scoreboard,
  args: {
    you: { name: 'worgho2', tag: '1234', mark: 'X', score: 2 },
    opponent: { name: 'bob', tag: '0042', mark: 'O', score: 1 },
    turn: 'you',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Scoreboard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const YourTurn: Story = {};
export const OpponentsTurn: Story = { args: { turn: 'opponent' } };
export const BetweenRounds: Story = { args: { turn: null } };
export const LongHandles: Story = {
  args: { opponent: { name: 'averyveryverylongname', tag: '0001', mark: 'O', score: 12 } },
};
