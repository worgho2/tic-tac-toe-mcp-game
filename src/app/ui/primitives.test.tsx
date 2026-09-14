import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import { Button } from './Button';
import { Cell } from './Cell';
import { Modal } from './Modal';
import { Overlay } from './Overlay';
import { ToastStack } from './Toast';

describe('Button', () => {
  it('defaults to type=button and the primary variant', () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('btn', 'btn--primary');
  });

  it('applies the requested variant', () => {
    render(<Button variant="danger">Deny</Button>);
    expect(screen.getByRole('button', { name: 'Deny' })).toHaveClass('btn--danger');
  });
});

describe('Badge', () => {
  it('shows the status text and class', () => {
    render(<Badge status="busy" />);
    expect(screen.getByText('busy')).toHaveClass('badge', 'badge--busy');
  });
});

describe('Cell', () => {
  it('labels itself by position and mark', () => {
    render(<Cell index={4} mark="X" disabled={false} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cell 5, X' })).toHaveClass('cell--x');
  });

  it('calls onClick only when enabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Cell index={0} mark={null} disabled={true} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Cell 1' }));
    expect(onClick).not.toHaveBeenCalled();
    rerender(<Cell index={0} mark={null} disabled={false} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Cell 1' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Modal', () => {
  it('is a labelled dialog whose buttons call the callbacks', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <Modal title="Leave the match?" confirmLabel="Leave" danger onConfirm={onConfirm} onCancel={onCancel}>
        <p>Your opponent will return to the lobby too.</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Leave the match?' });
    expect(dialog).toHaveTextContent('Your opponent will return to the lobby too.');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Escape cancels', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Modal title="Invite bob#0042 to a match?" confirmLabel="Invite" onConfirm={vi.fn()} onCancel={onCancel} />);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('focuses the cancel button on open', () => {
    render(<Modal title="Invite bob#0042 to a match?" confirmLabel="Invite" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});

describe('ToastStack', () => {
  it('renders nothing when empty and dismisses on click', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { rerender } = render(<ToastStack toasts={[]} onDismiss={onDismiss} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    rerender(<ToastStack toasts={[{ id: 7, text: 'bob#0042 declined your invite.' }]} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'bob#0042 declined your invite.' }));
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});

describe('Overlay', () => {
  it('renders confetti for a win, a duck for a loss and a plain ribbon for a draw', () => {
    const { rerender, container } = render(<Overlay outcome="win" />);
    expect(screen.getByTestId('overlay')).toHaveAttribute('data-outcome', 'win');
    expect(screen.getByText('You win!')).toBeInTheDocument();
    expect(container.querySelectorAll('.confetti__piece')).toHaveLength(40);

    rerender(<Overlay outcome="loss" />);
    expect(screen.getByText('You lose')).toBeInTheDocument();
    expect(screen.getByText('🦆')).toBeInTheDocument();
    expect(container.querySelectorAll('.confetti__piece')).toHaveLength(0);

    rerender(<Overlay outcome="draw" />);
    expect(screen.getByText('Draw')).toBeInTheDocument();
    expect(screen.queryByText('🦆')).not.toBeInTheDocument();
  });
});
