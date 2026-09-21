import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Banner } from './Banner';
import { Box } from './Box';
import { Button } from './Button';
import { Cell } from './Cell';
import { Handle } from './Handle';
import { Modal } from './Modal';
import { Overlay } from './Overlay';
import { Scoreboard } from './Scoreboard';
import { StatusDot } from './StatusDot';
import { ToastStack } from './Toast';
import { Window } from './Window';

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

describe('StatusDot', () => {
  it('draws the dot for the status and keeps the word for screen readers', () => {
    const { container } = render(<StatusDot status="busy" />);
    expect(screen.getByText('busy')).toHaveClass('sr-only');
    expect(container.querySelector('.dot')).toHaveClass('dot--busy');
    expect(container.querySelector('.dot')).toHaveAttribute('aria-hidden', 'true');
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
  it('renders confetti for a win, a duck for a loss and a plain banner for a draw', () => {
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

describe('Banner', () => {
  it('renders its text inside the banner', () => {
    render(<Banner className="extra">Players</Banner>);
    expect(screen.getByText('Players')).toHaveClass('banner__text');
    expect(screen.getByText('Players').parentElement).toHaveClass('banner', 'extra');
  });
});

describe('Box', () => {
  it('is an inset with an h3 title bar by default', () => {
    render(<Box title="About">text</Box>);
    const region = screen.getByRole('region', { name: 'About' });
    expect(region).toHaveClass('box', 'box--inset');
    expect(screen.getByRole('heading', { level: 3, name: 'About' }).parentElement).toHaveClass('box__bar');
  });

  it('renders no title bar without a title', () => {
    const { container } = render(<Box>text</Box>);
    expect(container.querySelector('.box__bar')).toBeNull();
    expect(container.firstElementChild).not.toHaveAttribute('aria-labelledby');
  });
});

describe('Scoreboard', () => {
  const you = { name: 'me', tag: '0001', mark: 'X' as const, score: 2 };
  const opponent = { name: 'bob', tag: '0042', mark: 'O' as const, score: 1 };

  it('shows both plates with handle, mark and score, and frames the player to move', () => {
    render(<Scoreboard you={you} opponent={opponent} turn="opponent" />);
    expect(screen.getByLabelText('Your score')).toHaveTextContent('2');
    expect(screen.getByLabelText('Opponent score')).toHaveTextContent('1');
    expect(screen.getByRole('region', { name: 'me#0001' })).not.toHaveClass('plate--active');
    expect(screen.getByRole('region', { name: 'bob#0042' })).toHaveClass('plate--active');
    expect(screen.getByText('Turn')).toBeInTheDocument();
  });

  it('frames nobody between rounds', () => {
    const { container } = render(<Scoreboard you={you} opponent={opponent} turn={null} />);
    expect(container.querySelector('.plate--active')).toBeNull();
    expect(screen.queryByText('Turn')).not.toBeInTheDocument();
  });
});

describe('Handle', () => {
  it('splits the name from the lighter #tag', () => {
    const { container } = render(<Handle name="bob" tag="0042" />);
    expect(container.firstElementChild).toHaveTextContent('bob#0042');
    expect(screen.getByText('bob')).toHaveClass('handle__name');
    expect(screen.getByText('#0042')).toHaveClass('handle__tag');
  });
});

describe('Window', () => {
  it('renders every slot and names the region after the title', () => {
    render(
      <Window title="Players" header={<p>header</p>} footer={<p>footer</p>}>
        <p>content</p>
      </Window>,
    );
    const region = screen.getByRole('region', { name: 'Players' });
    expect(region).toHaveClass('box', 'box--window', 'window', 'window--titled');
    expect(screen.getByRole('heading', { level: 2, name: 'Players' })).toHaveClass('window__title');
    expect(region.querySelector('.banner')).toHaveClass('window__banner');
    expect(screen.getByText('header').parentElement).toHaveClass('window__header-main');
    expect(screen.getByText('content').parentElement).toHaveClass('window__content');
    expect(screen.getByText('footer').parentElement).toHaveClass('window__footer');
  });

  it('renders no banner, header or footer when they are not passed', () => {
    const { container } = render(
      <Window className="extra">
        <p>content</p>
      </Window>,
    );
    const root = container.firstElementChild;
    expect(root).toHaveClass('window', 'extra');
    expect(root).not.toHaveClass('window--titled');
    expect(root?.querySelector('.banner, .window__header, .window__footer')).toBeNull();
    expect(root).not.toHaveAttribute('aria-labelledby');
  });
});
