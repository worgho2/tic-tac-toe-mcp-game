import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button, type ButtonVariant } from './Button';
import { Window } from './Window';

const VARIANTS: { variant: ButtonVariant; label: string }[] = [
  { variant: 'primary', label: 'Invite' },
  { variant: 'secondary', label: 'Cancel' },
  { variant: 'danger', label: 'Deny' },
];

// storybook-addon-pseudo-states forces :hover, :active and :focus-visible on the buttons carrying these classes.
const STATES = [
  { name: 'Default', className: '', disabled: false },
  { name: 'Hover', className: 'state-hover', disabled: false },
  { name: 'Pressed', className: 'state-active', disabled: false },
  { name: 'Focused', className: 'state-focus', disabled: false },
  { name: 'Disabled', className: '', disabled: true },
];

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { onClick: fn() },
  parameters: {
    pseudo: { hover: ['.state-hover'], active: ['.state-active'], focusVisible: ['.state-focus'] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every variant (columns) in every state (rows), on a Window so each theme shows its real surface. */
export const States: Story = {
  render: (args) => (
    <Window title="Buttons" style={{ width: 'max-content' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, max-content)', gap: 12, alignItems: 'center' }}>
        <span />
        {VARIANTS.map(({ variant }) => (
          <span key={variant} className="muted">
            {variant}
          </span>
        ))}
        {STATES.map((state) => (
          <div key={state.name} style={{ display: 'contents' }}>
            <span className="muted">{state.name}</span>
            {VARIANTS.map(({ variant, label }) => (
              <Button
                key={variant}
                variant={variant}
                className={state.className}
                disabled={state.disabled}
                onClick={args.onClick}
              >
                {label}
              </Button>
            ))}
          </div>
        ))}
      </div>
    </Window>
  ),
};
