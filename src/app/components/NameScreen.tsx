import { type FormEvent, useState } from 'react';

interface Props {
  onSubmit: (name: string) => void;
}

export function NameScreen({ onSubmit }: Props) {
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={submit}>
      <h2>Pick a name</h2>
      <div className="row">
        <input placeholder="Your name" maxLength={24} value={name} onChange={(event) => setName(event.target.value)} />
        <button type="submit">Join lobby</button>
      </div>
    </form>
  );
}
