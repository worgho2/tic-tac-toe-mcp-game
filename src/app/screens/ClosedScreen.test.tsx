import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { meta } from '../fixtures/views';
import { ClosedScreen } from './ClosedScreen';

describe('ClosedScreen', () => {
  it('tells the player to ask the assistant again', () => {
    render(<ClosedScreen meta={meta} />);
    expect(screen.getByRole('heading', { name: 'Session closed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close session' })).not.toBeInTheDocument();
    expect(screen.getByText('Ask the assistant to open the game again to play.')).toBeInTheDocument();
  });
});
