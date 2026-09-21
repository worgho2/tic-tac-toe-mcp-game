import { type FormEvent, useState } from 'react';
import { REPO_URL } from '../lib/project';
import { ActionRow } from '../ui/ActionRow';
import { Box } from '../ui/Box';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Link } from '../ui/Link';
import { ScreenFrame, type ScreenMeta } from './ScreenFrame';

interface Props {
  meta: ScreenMeta;
  error: string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function JoinScreen({ meta, error, onSubmit, onClose }: Props) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <ScreenFrame
      className="join"
      title="Tic-Tac-Toe"
      header={<p className="muted">Multiplayer MCP App game</p>}
      meta={meta}
      close={{ inMatch: false, onClose }}
    >
      <div className="columns">
        <Box title="About">
          <ul className="join__topics">
            <li>Play tic-tac-toe with other people, right inside your AI chat.</li>
            <li>Invite players from the lobby, or take on the model.</li>
            <li>Built as an MCP App: an MCP server that ships its own UI.</li>
          </ul>
          <p>
            Enjoying it?{' '}
            <Link href={REPO_URL} onOpen={meta.onOpenLink}>
              Give it a ★ on GitHub
            </Link>
          </p>
        </Box>
        <Box title="Play" className="join__play-box">
          <div className="join__play">
            <form className="join__form" onSubmit={submit}>
              <Input
                placeholder="Your name"
                aria-label="Your name"
                maxLength={24}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <ActionRow>
                <Button type="submit" disabled={!trimmed}>
                  Join Game
                </Button>
              </ActionRow>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        </Box>
      </div>
    </ScreenFrame>
  );
}
