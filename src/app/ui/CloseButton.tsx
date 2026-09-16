import { useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

interface Props {
  /** Adds the opponent warning to the confirmation. */
  inMatch: boolean;
  onClose: () => void;
}

/** Corner "X" that ends the session for good, behind an in-widget confirmation. */
export function CloseButton({ inMatch, onClose }: Props) {
  const [open, setOpen] = useState(false);

  const confirm = () => {
    setOpen(false);
    onClose();
  };

  return (
    <>
      <Button variant="secondary" className="close" aria-label="Close session" onClick={() => setOpen(true)}>
        ×
      </Button>
      {open && (
        <Modal
          title="Close this session?"
          confirmLabel="Close"
          danger
          onConfirm={confirm}
          onCancel={() => setOpen(false)}
        >
          <p>This widget will stop working. Ask the assistant to open the game again to play.</p>
          {inMatch && <p>Your opponent will return to the lobby.</p>}
        </Modal>
      )}
    </>
  );
}
