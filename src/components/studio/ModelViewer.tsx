import '@google/model-viewer';
import styles from './OutputViewer.module.css';

/** A `.glb`/`.gltf` Output the User can rotate. Loaded lazily: `<model-viewer>` brings three.js along. */
export default function ModelViewer({ src, label }: { src: string; label: string }) {
  return (
    <model-viewer
      class={styles.model}
      src={src}
      alt={label}
      camera-controls=""
      auto-rotate=""
    />
  );
}
