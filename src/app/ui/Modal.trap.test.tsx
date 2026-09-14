import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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

  it('Escape cancels even when focus is on body', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Modal title="Invite bob#0042 to a match?" confirmLabel="Invite" onConfirm={vi.fn()} onCancel={onCancel} />);
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Tab from outside the dialog returns focus to the first control', async () => {
    const user = userEvent.setup();
    render(<Modal title="Invite bob#0042 to a match?" confirmLabel="Invite" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    (document.activeElement as HTMLElement).blur();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('Shift+Tab from the dialog container goes to the last control', async () => {
    const user = userEvent.setup();
    render(<Modal title="Invite bob#0042 to a match?" confirmLabel="Invite" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    screen.getByRole('dialog').focus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Invite' })).toHaveFocus();
  });

  it('focus returns to the opener on unmount', async () => {
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <Modal
              title="Invite bob#0042 to a match?"
              confirmLabel="Invite"
              onConfirm={vi.fn()}
              onCancel={() => setOpen(false)}
            />
          )}
        </>
      );
    }
    const user = userEvent.setup();
    render(<Wrapper />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    // The modal's own mount effect moves focus to Cancel; that is expected, not the opener.
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(opener).toHaveFocus();
  });
});
