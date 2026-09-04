import { Download, Grid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CanvasSize, CellDimensions, GridDimensions, ImageGridConfig, SelectedImage } from '@/schemas/image-grid';
import styles from './grid-preview-panel.module.css';
import { ImageGridCanvas } from './image-grid-canvas';

interface GridPreviewPanelProps {
  images: SelectedImage[];
  config: ImageGridConfig;
  gridDimensions: GridDimensions;
  cellDimensions: CellDimensions;
  actualCanvasSize: CanvasSize;
  hasImages: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  onPreviewGenerated: (url: string | null) => void;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  onImageClick: (imageIndex: number) => void;
  onDownload: () => void;
}

/** Live canvas preview of the grid plus the PNG download action. */
export function GridPreviewPanel({
  images,
  config,
  gridDimensions,
  cellDimensions,
  actualCanvasSize,
  hasImages,
  canGenerate,
  isGenerating,
  onPreviewGenerated,
  onCanvasReady,
  onImageClick,
  onDownload,
}: GridPreviewPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview &amp; Download</CardTitle>
      </CardHeader>
      <CardContent className="stack space-4">
        {hasImages ? (
          <div className="stack space-4">
            <div className={styles.frame}>
              <ImageGridCanvas
                images={images}
                config={config}
                gridDimensions={gridDimensions}
                cellDimensions={cellDimensions}
                actualCanvasSize={actualCanvasSize}
                onPreviewGenerated={onPreviewGenerated}
                onCanvasReady={onCanvasReady}
                onImageClick={onImageClick}
                className={styles.canvas}
              />

              {/* Instructions overlay */}
              <div className={styles.callout}>💡 Click on images to adjust position</div>
            </div>

            <Button
              onClick={onDownload}
              disabled={!canGenerate || isGenerating}
              className={styles.fullWidth}
              size="lg"
            >
              <Download />
              {isGenerating ? 'Generating...' : 'Download PNG'}
            </Button>

            <div className={styles.footnote}>
              Final size: {Math.round(actualCanvasSize.width)} × {Math.round(actualCanvasSize.height)} pixels
            </div>
          </div>
        ) : (
          <div className={styles.empty}>
            <Grid className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>No images selected</p>
            <p className={styles.emptyHint}>Add images to see the preview</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
