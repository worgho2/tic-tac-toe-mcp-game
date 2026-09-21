import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Icon } from './Icon';

const meta = {
  title: 'UI/Icon',
  component: Icon,
  args: { name: 'check' },
} satisfies Meta<typeof Icon>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Icon-only buttons, as used for invites and the close button. */
export const InButtons: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button className="btn--icon" aria-label="Accept">
        <Icon name="check" />
      </Button>
      <Button variant="danger" className="btn--icon" aria-label="Decline">
        <Icon name="cross" />
      </Button>
      <Button variant="secondary" className="btn--icon" aria-label="Close">
        <Icon name="cross" />
      </Button>
    </div>
  ),
};
