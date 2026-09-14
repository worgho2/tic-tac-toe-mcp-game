import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal focus trap', () => {
  it('cycles Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">outside</button>
        <Modal title="Leave the match?" confirmLabel="Leave" danger onConfirm={vi.fn()} onCancel={vi.fn()} />
      </>,
    );
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const leave = screen.getByRole('button', { name: 'Leave' });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(leave).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(leave).toHaveFocus();
  });

  it('Escape cancels from anywhere inside the dialog', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Modal title="Invite bob#0042 to a match?" confirmLabel="Invite" onConfirm={vi.fn()} onCancel={onCancel} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Invite' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
