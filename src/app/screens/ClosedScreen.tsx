import { Box } from '../ui/Box';
import { ScreenFrame, type ScreenMeta } from './ScreenFrame';

/** Terminal screen: the id was closed on the server and this widget will not be revived. */
export function ClosedScreen({ meta }: { meta: ScreenMeta }) {
  return (
    <ScreenFrame
      className="closed"
      title="Session closed"
      header={<p className="muted">Thanks for playing</p>}
      meta={meta}
    >
      <Box className="closed__body">
        <p className="muted">Ask the assistant to open the game again to play.</p>
      </Box>
    </ScreenFrame>
  );
}
