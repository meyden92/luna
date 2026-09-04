// First import on purpose: the entry stylesheet opens with the cascade layer
// order, so it must lead the client bundle's CSS (see routes/__root.tsx).
import '@/styles/globals.css';
import { StartClient } from '@tanstack/react-start/client';
import { hydrateRoot } from 'react-dom/client';

hydrateRoot(document, <StartClient />);
