import { useEffect, useState } from 'react';
import type { OllamaAPI } from '@/types/ollama';

interface UseOllamaResult {
  ollama: OllamaAPI | null;
  isAvailable: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useOllama(): UseOllamaResult {
  const [ollama, setOllama] = useState<OllamaAPI | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if already available
    if (window.ollama) {
      setOllama(window.ollama);
      setIsAvailable(true);
      setIsLoading(false);
      return;
    }

    // Listen for the ready event
    const handleReady = () => {
      if (window.ollama) {
        setOllama(window.ollama);
        setIsAvailable(true);
        setError(null);
      }
      setIsLoading(false);
    };

    window.addEventListener('ollama-ready', handleReady);

    // Timeout after 3 seconds
    const timeout = setTimeout(() => {
      if (!window.ollama) {
        setError('Ollama Bridge extension not available. Is it installed and is this site trusted?');
        setIsLoading(false);
      }
    }, 3000);

    return () => {
      window.removeEventListener('ollama-ready', handleReady);
      clearTimeout(timeout);
    };
  }, []);

  return { ollama, isAvailable, isLoading, error };
}
