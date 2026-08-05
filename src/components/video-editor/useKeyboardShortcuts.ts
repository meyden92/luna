import { useEffect } from 'react';
import { useVideoEditorStore } from '@/hooks/stores/video-editor-store';
import { seekTo } from './video-ref';

interface Options {
  onSave: () => void;
  onToggleHelp: () => void;
}

/**
 * Global keyboard shortcuts for the video editor.
 * Active only when the editor has a loaded file and the user is not typing in an input.
 */
export function useKeyboardShortcuts({ onSave, onToggleHelp }: Options) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const state = useVideoEditorStore.getState();
      if (state.phase !== 'ready') return;

      const withMeta = e.metaKey || e.ctrlKey;

      if (withMeta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave();
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K': {
          e.preventDefault();
          state.setIsPlaying(!state.isPlaying);
          return;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const step = e.shiftKey ? 5 : 1;
          const t = Math.max(state.trimStart, state.currentTime - step);
          state.setCurrentTime(t);
          seekTo(t);
          return;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const step = e.shiftKey ? 5 : 1;
          const t = Math.min(state.trimEnd, state.currentTime + step);
          state.setCurrentTime(t);
          seekTo(t);
          return;
        }
        case 'j':
        case 'J': {
          e.preventDefault();
          const t = Math.max(state.trimStart, state.currentTime - 5);
          state.setCurrentTime(t);
          seekTo(t);
          return;
        }
        case 'l':
        case 'L': {
          e.preventDefault();
          const t = Math.min(state.trimEnd, state.currentTime + 5);
          state.setCurrentTime(t);
          seekTo(t);
          return;
        }
        case 'Home': {
          e.preventDefault();
          state.setCurrentTime(state.trimStart);
          seekTo(state.trimStart);
          return;
        }
        case 'End': {
          e.preventDefault();
          state.setCurrentTime(state.trimEnd);
          seekTo(state.trimEnd);
          return;
        }
        case 'i':
        case 'I': {
          e.preventDefault();
          state.setTrim(state.currentTime, state.trimEnd);
          return;
        }
        case 'o':
        case 'O': {
          e.preventDefault();
          state.setTrim(state.trimStart, state.currentTime);
          return;
        }
        case 'c':
        case 'C': {
          e.preventDefault();
          if (state.mode !== 'cut') state.setMode('cut');
          state.toggleCutAtCurrentTime();
          return;
        }
        case '1': {
          e.preventDefault();
          state.setMode('trim');
          return;
        }
        case '2': {
          e.preventDefault();
          state.setMode('cut');
          return;
        }
        case '3': {
          e.preventDefault();
          state.setMode('crop');
          return;
        }
        case '?': {
          e.preventDefault();
          onToggleHelp();
          return;
        }
        default:
          return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, onToggleHelp]);
}
