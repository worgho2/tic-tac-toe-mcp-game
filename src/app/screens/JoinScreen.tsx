import { type FormEvent, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Panel } from '../ui/Panel';
import { Ribbon } from '../ui/Ribbon';

interface Props {
  onlineCount: number;
  error: string | null;
  onSubmit: (name: string) => void;
}

export function JoinScreen({ onlineCount, error, onSubmit }: Props) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <Panel className="join">
      <Ribbon>Tic-Tac-Toe</Ribbon>
      <p className="muted join__online">
        {onlineCount} player{onlineCount === 1 ? '' : 's'} online
      </p>
      <form className="join__form" onSubmit={submit}>
        <Input
          placeholder="Your name"
          aria-label="Your name"
          maxLength={24}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={!trimmed}>
          Join Game
        </Button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}
