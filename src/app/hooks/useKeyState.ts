import { type KeyState, type TrackTarget, keyStateAt } from '../../core/tracks';
import { useDocumentStore } from '../store/documentStore';

/** Состояние ромба ключа у свойства в текущий момент. Перерисовка — только когда оно меняется. */
export function useKeyState(target: TrackTarget | null): KeyState {
  return useDocumentStore((s) =>
    target ? keyStateAt(s.animation.tracks, target, s.time) : 'none',
  );
}
