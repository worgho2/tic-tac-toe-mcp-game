interface Props {
  fromName: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function InviteBanner({ fromName, onAccept, onDecline }: Props) {
  return (
    <div className="banner row">
      <span>{fromName} invited you.</span>
      <button type="button" onClick={onAccept}>
        Accept
      </button>
      <button type="button" className="secondary" onClick={onDecline}>
        Decline
      </button>
    </div>
  );
}
