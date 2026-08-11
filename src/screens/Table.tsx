import { useGame } from '../hooks/useGame.ts';
import { playerId } from '../lib/session.ts';
import { TableView } from './TableView.tsx';

/** Connects one room to the table UI. All the rendering lives in TableView. */
export function Table({
  code,
  onLeave,
  onJoinNeeded,
}: {
  code: string;
  onLeave: () => void;
  /** This device has no seat here yet — send them through the join flow. */
  onJoinNeeded: () => void;
}) {
  const game = useGame(code);
  return (
    <TableView game={game} me={playerId()} onLeave={onLeave} onJoinNeeded={onJoinNeeded} />
  );
}
