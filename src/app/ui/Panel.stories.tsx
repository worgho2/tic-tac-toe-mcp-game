import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from './Panel';
import { Ribbon } from './Ribbon';

const meta = {
  title: 'UI/Panel',
  component: Panel,
} satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  args: { children: <p>A 9-slice Kenney panel with 16px borders.</p> },
};
export const WithRibbon: Story = {
  render: () => (
    <Panel style={{ marginTop: 44 }}>
      <Ribbon>Tic-Tac-Toe</Ribbon>
      <p className="muted">The ribbon overlaps the panel top, like Kenney's sample.</p>
    </Panel>
  ),
};
export const Card: Story = {
  render: () => (
    <ul className="cards">
      <li className="card">
        <span className="card__handle">bob#0042</span>
        <span className="card__actions">card surface (8px borders)</span>
      </li>
    </ul>
  ),
};
