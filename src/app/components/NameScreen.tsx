import { type FormEvent, useState } from 'react';

interface Props {
  onlineCount: number;
  error: string | null;
  onSubmit: (name: string) => void;
}

export function NameScreen({ onlineCount, error, onSubmit }: Props) {
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={submit}>
      <h2>Tic-Tac-Toe</h2>
      <p className="muted">
        {onlineCount} player{onlineCount === 1 ? '' : 's'} online
      </p>
      {error && <div className="banner">{error}</div>}
      <div className="row">
        <input placeholder="Your name" maxLength={24} value={name} onChange={(event) => setName(event.target.value)} />
        <button type="submit">Join Game</button>
      </div>
    </form>
  );
}
