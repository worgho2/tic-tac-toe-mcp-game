import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClosedScreen } from './ClosedScreen';

describe('ClosedScreen', () => {
  it('tells the player to ask the assistant again', () => {
    render(<ClosedScreen />);
    expect(screen.getByText('Session closed')).toBeInTheDocument();
    expect(screen.getByText('Ask the assistant to open the game again to play.')).toBeInTheDocument();
  });
});
