import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Window } from './Window';

const meta = {
  title: 'UI/Window',
  component: Window,
  args: {
    title: 'Sample window',
    header: <p className="muted">3 players online</p>,
    children: <p>The window is the background of every screen: banner, header, content and footer.</p>,
    footer: (
      <>
        <Button variant="secondary">No way!</Button>
        <Button>Okay</Button>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Window>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllSlots: Story = {};
export const ContentOnly: Story = { args: { header: undefined, footer: undefined } };
export const Untitled: Story = { args: { title: undefined } };
export const LongTitle: Story = { args: { title: 'You win! Next round starts in a moment' } };
