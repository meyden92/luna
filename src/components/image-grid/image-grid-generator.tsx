import { AlertTriangle, Download, Grid, Palette, Settings, Sliders } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { deriveImageGridLayout, useImageGridStore } from '@/hooks/stores/image-grid-store';
import { useDebounce } from '@/hooks/use-debounce';
import { calculateAutoFitDimensions } from '@/libs/image-grid/utils';
import { ImageGridCanvas } from './image-grid-canvas';
import { ImagePositionEditor } from './image-position-editor';
import { ImageSelector } from './image-selector';

export function ImageGridGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [localCellWidth, setLocalCellWidth] = useState<string>('300');
  const [localCellHeight, setLocalCellHeight] = useState<string>('300');
  const [localCanvasWidth, setLocalCanvasWidth] = useState<string>('1200');
  const [localCanvasHeight, setLocalCanvasHeight] = useState<string>('1200');
  const [localManualCols, setLocalManualCols] = useState<string>('3');
  const [localManualRows, setLocalManualRows] = useState<string>('3');
  const [positionEditorState, setPositionEditorState] = useState<{
    isOpen: boolean;
    imageIndex: number;
  }>({ isOpen: false, imageIndex: -1 });

  const {
    selectedImages,
    config,
    isGenerating,
    addLocalImages,
    removeImage,
    reorderImages,
    updateConfig,
    updateImagePositionAndZoom,
    clearImages,
    setGenerating,
    setPreviewUrl,
  } = useImageGridStore(
    useShallow((state) => ({
      selectedImages: state.selectedImages,
      config: state.config,
      isGenerating: state.isGenerating,
      addLocalImages: state.addLocalImages,
      removeImage: state.removeImage,
      reorderImages: state.reorderImages,
      updateConfig: state.updateConfig,
      updateImagePositionAndZoom: state.updateImagePositionAndZoom,
      clearImages: state.clearImages,
      setGenerating: state.setGenerating,
      setPreviewUrl: state.setPreviewUrl,
    })),
  );

  const { gridDimensions, cellDimensions, actualCanvasSize, gridCapacityWarning, hasImages, canGenerate } = useMemo(
    () => deriveImageGridLayout({ selectedImages, config }),
    [selectedImages, config],
  );

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
      const optimalDimensions = calculateAutoFitDimensions({ width: config.width, height: config.height }, selectedImages.length);

      updateConfig({
        autoFit: newAutoFit,
        width: optimalDimensions.width,
        height: optimalDimensions.height,
      });
    } else {
      // When switching to fixed mode, keep current dimensions
      updateConfig({ autoFit: newAutoFit });
    }
  }, [config.autoFit, config.width, config.height, hasImages, selectedImages.length, updateConfig]);

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

  const handleDownload = useCallback(async () => {
    if (!canvasRef.current || !canGenerate) return;

    setGenerating(true);
    try {
      canvasRef.current.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `image-grid-${Math.round(actualCanvasSize.width)}x${Math.round(actualCanvasSize.height)}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          toast.success('Image grid downloaded successfully!');
        } else {
          toast.error('Failed to generate image grid');
        }
        setGenerating(false);
      }, 'image/png');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download image grid');
      setGenerating(false);
    }
  }, [canGenerate, actualCanvasSize, setGenerating]);

  const handleCanvasReady = (canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Grid className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Image Grid Generator</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Grid Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Canvas Dimensions */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
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
                      className={config.autoFit ? 'bg-muted/50' : ''}
                    />
                  </div>
                  <div className="space-y-2">
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
                      className={config.autoFit ? 'bg-muted/50' : ''}
                    />
                  </div>
                </div>

                {/* Auto-fit Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Canvas Size</Label>
                    <p className="text-xs text-muted-foreground">
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
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm font-medium mb-1">Output Size</div>
                    <div className="text-sm text-muted-foreground">
                      {Math.round(actualCanvasSize.width)} × {Math.round(actualCanvasSize.height)} px
                      {config.autoFit && actualCanvasSize.height < config.height && (
                        <span className="text-green-600 ml-2">
                          (cropped from {config.width} × {config.height})
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Grid Layout Controls */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Grid Layout</Label>
                  <Button
                    variant={config.useManualGrid ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateConfig({ useManualGrid: !config.useManualGrid }, gridDimensions)}
                  >
                    {config.useManualGrid ? 'Manual' : 'Auto'}
                  </Button>
                </div>

                {config.useManualGrid ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
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
                    <div className="space-y-2">
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
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm font-medium mb-1">Auto Layout</div>
                    <div className="text-sm text-muted-foreground">
                      {gridDimensions.cols} × {gridDimensions.rows} grid ({selectedImages.length} images)
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Cell size: {Math.round(cellDimensions.width)} × {Math.round(cellDimensions.height)} px
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Select images to see grid layout</div>
                  </div>
                )}

                {/* Grid Capacity Warning */}
                {gridCapacityWarning && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-800">{gridCapacityWarning.message}</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Spacing */}
              <div className="space-y-2">
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
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Cell Size</Label>
                    <p className="text-xs text-muted-foreground">
                      {config.useFixedCellSize ? 'Fixed: All cells same size' : 'Auto: Fit canvas dimensions'}
                    </p>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
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
                    <div className="space-y-2">
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
              <div className="space-y-2">
                <Label
                  htmlFor="backgroundColor"
                  className="flex items-center gap-2"
                >
                  <Palette className="h-4 w-4" />
                  Background Color
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="backgroundColor"
                    type="color"
                    value={config.backgroundColor}
                    onChange={(e) => debouncedColorUpdate(e.target.value)}
                    className="w-16 h-10 p-1 border rounded"
                  />
                  <Input
                    type="text"
                    value={config.backgroundColor}
                    onChange={(e) => debouncedColorUpdate(e.target.value)}
                    placeholder="#ffffff"
                    className="flex-1"
                  />
                </div>
              </div>

              <Separator />

              {/* Image Filters */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Sliders className="h-4 w-4" />
                    Image Filters
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    {showFilters ? 'Hide' : 'Show'}
                  </Button>
                </div>

                {showFilters && (
                  <div className="space-y-4">
                    {/* Blur */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Blur</Label>
                        <span className="text-sm text-muted-foreground">{config.filters.blur}px</span>
                      </div>
                      <Slider
                        value={[config.filters.blur]}
                        onValueChange={(value) => {
                          const newValue = Array.isArray(value) ? value[0] : value;
                          updateConfig({ filters: { blur: newValue ?? 0 } });
                        }}
                        max={10}
                        step={0.5}
                        className="w-full"
                      />
                    </div>

                    {/* Grayscale */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Grayscale</Label>
                        <span className="text-sm text-muted-foreground">{config.filters.grayscale}%</span>
                      </div>
                      <Slider
                        value={[config.filters.grayscale]}
                        onValueChange={(value) => {
                          const newValue = Array.isArray(value) ? value[0] : value;
                          updateConfig({ filters: { grayscale: newValue ?? 0 } });
                        }}
                        max={100}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    {/* Saturation */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Saturation</Label>
                        <span className="text-sm text-muted-foreground">{config.filters.saturation}%</span>
                      </div>
                      <Slider
                        value={[config.filters.saturation]}
                        onValueChange={(value) => {
                          const newValue = Array.isArray(value) ? value[0] : value;
                          updateConfig({ filters: { saturation: newValue ?? 100 } });
                        }}
                        max={200}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    {/* Brightness */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Brightness</Label>
                        <span className="text-sm text-muted-foreground">{config.filters.brightness}%</span>
                      </div>
                      <Slider
                        value={[config.filters.brightness]}
                        onValueChange={(value) => {
                          const newValue = Array.isArray(value) ? value[0] : value;
                          updateConfig({ filters: { brightness: newValue ?? 100 } });
                        }}
                        min={50}
                        max={150}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    {/* Contrast */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Contrast</Label>
                        <span className="text-sm text-muted-foreground">{config.filters.contrast}%</span>
                      </div>
                      <Slider
                        value={[config.filters.contrast]}
                        onValueChange={(value) => {
                          const newValue = Array.isArray(value) ? value[0] : value;
                          updateConfig({ filters: { contrast: newValue ?? 100 } });
                        }}
                        min={50}
                        max={150}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    {/* Sepia */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Sepia</Label>
                        <span className="text-sm text-muted-foreground">{config.filters.sepia}%</span>
                      </div>
                      <Slider
                        value={[config.filters.sepia]}
                        onValueChange={(value) => {
                          const newValue = Array.isArray(value) ? value[0] : value;
                          updateConfig({ filters: { sepia: newValue ?? 0 } });
                        }}
                        max={100}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    {/* Reset Filters */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateConfig({
                          filters: { blur: 0, grayscale: 0, saturation: 100, brightness: 100, contrast: 100, sepia: 0 },
                        })
                      }
                      className="w-full"
                    >
                      Reset All Filters
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <ImageSelector
            selectedImages={selectedImages}
            onAddLocalImages={addLocalImages}
            onRemoveImage={removeImage}
            onReorderImages={reorderImages}
            onClearAll={clearImages}
          />
        </div>

        {/* Preview and Download */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Preview & Download</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasImages ? (
                <div className="space-y-4">
                  <div className="relative w-full overflow-hidden border border-gray-200 rounded-lg group">
                    <ImageGridCanvas
                      images={selectedImages}
                      config={config}
                      gridDimensions={gridDimensions}
                      cellDimensions={cellDimensions}
                      actualCanvasSize={actualCanvasSize}
                      onPreviewGenerated={setPreviewUrl}
                      onCanvasReady={handleCanvasReady}
                      onImageClick={(imageIndex) => setPositionEditorState({ isOpen: true, imageIndex })}
                      className="w-full transition-opacity hover:opacity-90"
                    />

                    {/* Instructions overlay */}
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                      💡 Click on images to adjust position
                    </div>
                  </div>

                  <Button
                    onClick={handleDownload}
                    disabled={!canGenerate || isGenerating}
                    className="w-full"
                    size="lg"
                  >
                    <Download className="h-5 w-5 mr-2" />
                    {isGenerating ? 'Generating...' : 'Download PNG'}
                  </Button>

                  <div className="text-xs text-muted-foreground text-center">
                    Final size: {Math.round(actualCanvasSize.width)} × {Math.round(actualCanvasSize.height)} pixels
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Grid className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No images selected</p>
                  <p className="text-sm">Add images to see the preview</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Position Editor Modal */}
      {positionEditorState.isOpen && positionEditorState.imageIndex >= 0 && selectedImages[positionEditorState.imageIndex] && (
        <ImagePositionEditor
          image={selectedImages[positionEditorState.imageIndex]!}
          isOpen={positionEditorState.isOpen}
          onClose={() => setPositionEditorState({ isOpen: false, imageIndex: -1 })}
          onUpdateOffset={(offsetX, offsetY, zoom) => {
            const image = selectedImages[positionEditorState.imageIndex];
            if (image) {
              updateImagePositionAndZoom(image.id, offsetX, offsetY, zoom);
            }
          }}
          cellDimensions={cellDimensions}
        />
      )}
    </div>
  );
}
