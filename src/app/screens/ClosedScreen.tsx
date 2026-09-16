import { Panel } from '../ui/Panel';
import { Ribbon } from '../ui/Ribbon';

/** Terminal screen: the id was closed on the server and this widget will not be revived. */
export function ClosedScreen() {
  return (
    <Panel className="closed">
      <Ribbon>Session closed</Ribbon>
      <p className="muted">Ask the assistant to open the game again to play.</p>
    </Panel>
  );
}
