import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/** The `<model-viewer>` attributes the Studio's 3D viewer sets. */
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        class?: string;
        src: string;
        alt?: string;
        'camera-controls'?: string;
        'auto-rotate'?: string;
      };
    }
  }
}
