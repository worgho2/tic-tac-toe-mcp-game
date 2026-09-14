import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Cell } from './Cell';

const meta = {
  title: 'UI/Cell',
  component: Cell,
  args: { index: 4, mark: null, disabled: false, onClick: fn() },
} satisfies Meta<typeof Cell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const X: Story = { args: { mark: 'X', disabled: true } };
export const O: Story = { args: { mark: 'O', disabled: true } };
export const Board: Story = {
  render: () => (
    <div className="board">
      {(['X', 'O', 'X', null, 'O', null, null, null, 'X'] as const).map((mark, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3x3 grid
        <Cell key={index} index={index} mark={mark} disabled={mark !== null} onClick={fn()} />
      ))}
    </div>
  ),
};
