import { AlertTriangle, Palette, Settings } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useDebounce } from '@/hooks/use-debounce';
import { calculateAutoFitDimensions } from '@/libs/image-grid/utils';
import type { CanvasSize, CellDimensions, ConfigUpdate, GridCapacityWarning, GridDimensions, ImageGridConfig } from '@/schemas/image-grid';
import styles from './grid-config-panel.module.css';
import { ImageFilterControls } from './image-filter-controls';

interface GridConfigPanelProps {
  config: ImageGridConfig;
  updateConfig: (updates: ConfigUpdate, currentGridDimensions?: GridDimensions) => void;
  gridDimensions: GridDimensions;
  cellDimensions: CellDimensions;
  actualCanvasSize: CanvasSize;
  gridCapacityWarning: GridCapacityWarning | null;
  hasImages: boolean;
  imageCount: number;
}

/**
 * Every knob that shapes the generated grid: canvas size, layout, spacing,
 * cell size, background colour and filters. Numeric inputs keep a local string
 * mirror so a half-typed value is not pushed into the store.
 */
export function GridConfigPanel({
  config,
  updateConfig,
  gridDimensions,
  cellDimensions,
  actualCanvasSize,
  gridCapacityWarning,
  hasImages,
  imageCount,
}: GridConfigPanelProps) {
  const [localCellWidth, setLocalCellWidth] = useState<string>('300');
  const [localCellHeight, setLocalCellHeight] = useState<string>('300');
  const [localCanvasWidth, setLocalCanvasWidth] = useState<string>('1200');
  const [localCanvasHeight, setLocalCanvasHeight] = useState<string>('1200');
  const [localManualCols, setLocalManualCols] = useState<string>('3');
  const [localManualRows, setLocalManualRows] = useState<string>('3');

  const debouncedColorUpdate = useDebounce((color: string) => updateConfig({ backgroundColor: color }), 300);

  const handleCellSizeUpdate = useCallback(
    (field: 'fixedCellWidth' | 'fixedCellHeight', value: string) => {
      const numValue = Number(value);
      if (!Number.isNaN(numValue) && numValue >= 50 && numValue <= 1000) {
        updateConfig({ [field]: numValue });
      }
    },
    [updateConfig],
  );

  const handleCanvasSizeUpdate = useCallback(
    (field: 'width' | 'height', value: string) => {
      const numValue = Number(value);
      if (!Number.isNaN(numValue) && numValue >= 100 && numValue <= 4000) {
        updateConfig({ [field]: numValue });
      }
    },
    [updateConfig],
  );

  const handleManualGridUpdate = useCallback(
    (field: 'manualCols' | 'manualRows', value: string) => {
      const numValue = Number(value);
      if (!Number.isNaN(numValue) && numValue >= 1 && numValue <= 10) {
        updateConfig({ [field]: numValue });
      }
    },
    [updateConfig],
  );

  const handleAutoFitToggle = useCallback(() => {
    const newAutoFit = !config.autoFit;

    if (newAutoFit && hasImages) {
      // When switching to auto-fit, calculate optimal dimensions based on current content
      const optimalDimensions = calculateAutoFitDimensions({ width: config.width, height: config.height }, imageCount);

      updateConfig({
        autoFit: newAutoFit,
        width: optimalDimensions.width,
        height: optimalDimensions.height,
      });
    } else {
      // When switching to fixed mode, keep current dimensions
      updateConfig({ autoFit: newAutoFit });
    }
  }, [config.autoFit, config.width, config.height, hasImages, imageCount, updateConfig]);

  const handleCellSizeKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  }, []);

  useEffect(() => {
    setLocalCellWidth((config.fixedCellWidth || 300).toString());
    setLocalCellHeight((config.fixedCellHeight || 300).toString());
  }, [config.fixedCellWidth, config.fixedCellHeight]);

  useEffect(() => {
    // When switching to fixed mode, sync local state with current config values
    if (!config.autoFit) {
      setLocalCanvasWidth(config.width.toString());
      setLocalCanvasHeight(config.height.toString());
    }
  }, [config.width, config.height, config.autoFit]);

  useEffect(() => {
    setLocalManualCols((config.manualCols || 3).toString());
    setLocalManualRows((config.manualRows || 3).toString());
  }, [config.manualCols, config.manualRows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="cluster space-2">
          <Settings className={styles.headerIcon} />
          Grid Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="stack space-4">
        {/* Canvas Dimensions */}
        <div className="stack space-4">
          <div className={styles.pair}>
            <div className="stack space-2">
              <Label htmlFor="width">Width (px)</Label>
              <Input
                id="width"
                type="number"
                min={100}
                max={4000}
                value={localCanvasWidth}
                onChange={(e) => {
                  setLocalCanvasWidth(e.target.value);
                  if (config.autoFit) {
                    // In auto-fit mode, still allow editing but it affects max dimensions
                    const numValue = Number(e.target.value);
                    if (!Number.isNaN(numValue)) {
                      handleCanvasSizeUpdate('width', e.target.value);
                    }
                  }
                }}
                onBlur={(e) => !config.autoFit && handleCanvasSizeUpdate('width', e.target.value)}
                onKeyDown={handleCellSizeKeyDown}
                placeholder="Width in pixels"
                className={config.autoFit ? styles.derivedInput : undefined}
              />
            </div>
            <div className="stack space-2">
              <Label htmlFor="height">Height (px)</Label>
              <Input
                id="height"
                type="number"
                min={100}
                max={4000}
                value={localCanvasHeight}
                onChange={(e) => {
                  setLocalCanvasHeight(e.target.value);
                  if (config.autoFit) {
                    // In auto-fit mode, still allow editing but it affects max dimensions
                    const numValue = Number(e.target.value);
                    if (!Number.isNaN(numValue)) {
                      handleCanvasSizeUpdate('height', e.target.value);
                    }
                  }
                }}
                onBlur={(e) => !config.autoFit && handleCanvasSizeUpdate('height', e.target.value)}
                onKeyDown={handleCellSizeKeyDown}
                placeholder="Height in pixels"
                className={config.autoFit ? styles.derivedInput : undefined}
              />
            </div>
          </div>

          {/* Auto-fit Toggle */}
          <div className={styles.spread}>
            <div className="stack space-1">
              <Label className="type-sm weight-medium">Canvas Size</Label>
              <p className={styles.controlHint}>
                {config.autoFit ? 'Auto-fit: Crops to content, respects max dimensions above' : 'Fixed: Uses exact canvas dimensions'}
              </p>
            </div>
            <Button
              variant={config.autoFit ? 'default' : 'outline'}
              size="sm"
              onClick={handleAutoFitToggle}
            >
              {config.autoFit ? 'Auto-fit' : 'Fixed'}
            </Button>
          </div>

          {/* Canvas Size Info */}
          {hasImages && (
            <div className={styles.well}>
              <div className={styles.wellTitle}>Output Size</div>
              <div className={styles.wellText}>
                {Math.round(actualCanvasSize.width)} × {Math.round(actualCanvasSize.height)} px
                {config.autoFit && actualCanvasSize.height < config.height && (
                  <span className={styles.cropNote}>
                    (cropped from {config.width} × {config.height})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Grid Layout Controls */}
        <div className="stack space-4">
          <div className={styles.spread}>
            <Label className="type-sm weight-medium">Grid Layout</Label>
            <Button
              variant={config.useManualGrid ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateConfig({ useManualGrid: !config.useManualGrid }, gridDimensions)}
            >
              {config.useManualGrid ? 'Manual' : 'Auto'}
            </Button>
          </div>

          {config.useManualGrid ? (
            <div className={styles.pair}>
              <div className="stack space-2">
                <Label htmlFor="cols">Columns</Label>
                <Input
                  id="cols"
                  type="number"
                  min={1}
                  max={10}
                  value={localManualCols}
                  onChange={(e) => setLocalManualCols(e.target.value)}
                  onBlur={(e) => handleManualGridUpdate('manualCols', e.target.value)}
                  onKeyDown={handleCellSizeKeyDown}
                  placeholder="Number of columns"
                />
              </div>
              <div className="stack space-2">
                <Label htmlFor="rows">Rows</Label>
                <Input
                  id="rows"
                  type="number"
                  min={1}
                  max={10}
                  value={localManualRows}
                  onChange={(e) => setLocalManualRows(e.target.value)}
                  onBlur={(e) => handleManualGridUpdate('manualRows', e.target.value)}
                  onKeyDown={handleCellSizeKeyDown}
                  placeholder="Number of rows"
                />
              </div>
            </div>
          ) : hasImages ? (
            <div className={styles.well}>
              <div className={styles.wellTitle}>Auto Layout</div>
              <div className={styles.wellText}>
                {gridDimensions.cols} × {gridDimensions.rows} grid ({imageCount} images)
              </div>
              <div className={styles.wellSubtext}>
                Cell size: {Math.round(cellDimensions.width)} × {Math.round(cellDimensions.height)} px
              </div>
            </div>
          ) : (
            <div className={styles.well}>
              <div className={styles.wellText}>Select images to see grid layout</div>
            </div>
          )}

          {/* Grid Capacity Warning */}
          {gridCapacityWarning && (
            <div className={styles.warning}>
              <AlertTriangle className={styles.warningIcon} />
              <span className={styles.warningText}>{gridCapacityWarning.message}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Spacing */}
        <div className="stack space-2">
          <Label htmlFor="spacing">Spacing (px)</Label>
          <Input
            id="spacing"
            type="number"
            min={0}
            max={100}
            value={config.spacing}
            onChange={(e) => {
              const numValue = Number(e.target.value);
              if (!Number.isNaN(numValue) && numValue >= 0 && numValue <= 100) {
                updateConfig({ spacing: numValue });
              }
            }}
          />
        </div>

        <Separator />

        {/* Fixed Cell Size */}
        <div className="stack space-4">
          <div className={styles.spread}>
            <div className="stack space-1">
              <Label className="type-sm weight-medium">Cell Size</Label>
              <p className={styles.controlHint}>{config.useFixedCellSize ? 'Fixed: All cells same size' : 'Auto: Fit canvas dimensions'}</p>
            </div>
            <Button
              variant={config.useFixedCellSize ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateConfig({ useFixedCellSize: !config.useFixedCellSize })}
            >
              {config.useFixedCellSize ? 'Fixed' : 'Auto'}
            </Button>
          </div>

          {config.useFixedCellSize && (
            <div className={styles.pair}>
              <div className="stack space-2">
                <Label htmlFor="fixedWidth">Cell Width (px)</Label>
                <Input
                  id="fixedWidth"
                  type="number"
                  min={50}
                  max={1000}
                  value={localCellWidth}
                  onChange={(e) => setLocalCellWidth(e.target.value)}
                  onBlur={(e) => handleCellSizeUpdate('fixedCellWidth', e.target.value)}
                  onKeyDown={handleCellSizeKeyDown}
                  placeholder="Width in pixels"
                />
              </div>
              <div className="stack space-2">
                <Label htmlFor="fixedHeight">Cell Height (px)</Label>
                <Input
                  id="fixedHeight"
                  type="number"
                  min={50}
                  max={1000}
                  value={localCellHeight}
                  onChange={(e) => setLocalCellHeight(e.target.value)}
                  onBlur={(e) => handleCellSizeUpdate('fixedCellHeight', e.target.value)}
                  onKeyDown={handleCellSizeKeyDown}
                  placeholder="Height in pixels"
                />
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Background Color */}
        <div className="stack space-2">
          <Label
            htmlFor="backgroundColor"
            className="cluster space-2"
          >
            <Palette className={styles.labelIcon} />
            Background Color
          </Label>
          <div className={styles.colorRow}>
            <Input
              id="backgroundColor"
              type="color"
              value={config.backgroundColor}
              onChange={(e) => debouncedColorUpdate(e.target.value)}
              className={styles.colorSwatch}
            />
            <Input
              type="text"
              value={config.backgroundColor}
              onChange={(e) => debouncedColorUpdate(e.target.value)}
              placeholder="#ffffff"
              className={styles.colorText}
            />
          </div>
        </div>

        <Separator />

        <ImageFilterControls
          filters={config.filters}
          onChange={(filters) => updateConfig({ filters })}
        />
      </CardContent>
    </Card>
  );
}
