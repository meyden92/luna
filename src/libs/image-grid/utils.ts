export function calculateOptimalGridLayout(imageCount: number, canvasWidth: number, canvasHeight: number): { cols: number; rows: number } {
  if (imageCount === 0) return { cols: 0, rows: 0 };

  const aspectRatio = canvasWidth / canvasHeight;
  let bestLayout = { cols: 1, rows: imageCount, score: Number.MAX_VALUE };

  for (let cols = 1; cols <= imageCount; cols++) {
    const rows = Math.ceil(imageCount / cols);
    const emptyCells = cols * rows - imageCount;
    const layoutAspectRatio = cols / rows;
    const aspectRatioDiff = Math.abs(layoutAspectRatio - aspectRatio);
    const score = emptyCells + aspectRatioDiff * 2;

    if (score < bestLayout.score) {
      bestLayout = { cols, rows, score };
    }
  }

  return { cols: bestLayout.cols, rows: bestLayout.rows };
}

export function calculateAutoFitDimensions(
  currentCanvasSize: { width: number; height: number },
  imageCount: number,
): { width: number; height: number } {
  if (imageCount === 0) {
    return currentCanvasSize;
  }

  // Calculate based on content, not arbitrary padding
  const minDimension = Math.min(currentCanvasSize.width, currentCanvasSize.height);

  // Maintain aspect ratio but ensure reasonable minimum size
  const aspectRatio = currentCanvasSize.width / currentCanvasSize.height;

  let optimalWidth: number;
  let optimalHeight: number;

  if (aspectRatio > 1) {
    // Landscape
    optimalHeight = Math.max(600, Math.min(2000, minDimension));
    optimalWidth = Math.round(optimalHeight * aspectRatio);
  } else {
    // Portrait or square
    optimalWidth = Math.max(600, Math.min(2000, minDimension));
    optimalHeight = Math.round(optimalWidth / aspectRatio);
  }

  return {
    width: Math.max(800, Math.min(3000, optimalWidth)),
    height: Math.max(600, Math.min(3000, optimalHeight)),
  };
}
