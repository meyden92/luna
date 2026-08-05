import { Eye } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

interface ImagePreviewProps {
  previewUrl: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'small' | 'default' | 'large' | 'raw';
  position?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  dropdownMode?: boolean; // Special mode for dropdown items
}

export function ImagePreview({
  previewUrl,
  children,
  size = 'lg',
  position = 'auto',
  className = '',
  dropdownMode = false,
}: ImagePreviewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [actualPosition, setActualPosition] = useState(position);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Create portal container for dropdown mode
  useEffect(() => {
    if (dropdownMode && typeof window !== 'undefined') {
      setPortalContainer(document.body);
    }
  }, [dropdownMode]);

  if (!previewUrl) {
    return <>{children}</>;
  }

  // Map size strings to consistent format
  const normalizeSize = (inputSize: string) => {
    switch (inputSize) {
      case 'small':
        return 'sm';
      case 'default':
        return 'md';
      case 'large':
        return 'lg';
      case 'raw':
        return 'raw';
      default:
        return inputSize as 'sm' | 'md' | 'lg' | 'raw';
    }
  };

  const normalizedSize = normalizeSize(size);

  const sizeClasses = {
    sm: 'w-60 h-44',
    md: 'w-[25rem] h-[18.75rem]',
    lg: 'w-[40rem] h-[30rem]',
    raw: 'w-auto h-auto max-w-5xl max-h-[85vh] min-w-[30rem] min-h-[22.5rem]',
  };

  const getAutoPosition = () => {
    if (!containerRef.current || position !== 'auto') return position;

    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let width = 400;
    let height = 300;
    switch (normalizedSize) {
      case 'sm':
        width = 240;
        height = 176;
        break;
      case 'md':
        width = 400;
        height = 300;
        break;
      case 'lg':
        width = 640;
        height = 480;
        break;
      case 'raw':
        width = Math.min(1120, viewportWidth * 0.9);
        height = Math.min(viewportHeight * 0.85, 900);
        break;
    }

    // For dropdown mode, prefer right placement to avoid conflicts
    if (dropdownMode) {
      // Check if there's enough space on the right
      if (rect.right + width + 20 < viewportWidth) {
        return 'right';
      }
      // Otherwise try left
      if (rect.left - width - 20 > 0) {
        return 'left';
      }
      // Fallback to bottom if no horizontal space
      return rect.bottom + height + 20 < viewportHeight ? 'bottom' : 'top';
    }

    // For regular mode, prefer top/bottom
    if (rect.top - height - 20 > 0) {
      return 'top';
    }
    if (rect.bottom + height + 20 < viewportHeight) {
      return 'bottom';
    }
    // Fallback to right/left
    return rect.right + width + 20 < viewportWidth ? 'right' : 'left';
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    const newPosition = getAutoPosition();
    setActualPosition(newPosition);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2',
    auto: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
  };

  const getPreviewPosition = () => {
    if (!containerRef.current) return {};

    const rect = containerRef.current.getBoundingClientRect();

    let width = 400;
    let height = 300;
    switch (normalizedSize) {
      case 'sm':
        width = 240;
        height = 176;
        break;
      case 'md':
        width = 400;
        height = 300;
        break;
      case 'lg':
        width = 640;
        height = 480;
        break;
      case 'raw':
        width = Math.min(1120, window.innerWidth * 0.9);
        height = Math.min(window.innerHeight * 0.85, 900);
        break;
    }

    switch (actualPosition) {
      case 'right':
        return {
          top: rect.top + rect.height / 2 - height / 2,
          left: rect.right + 12,
        };
      case 'left':
        return {
          top: rect.top + rect.height / 2 - height / 2,
          left: rect.left - width - 12,
        };
      case 'bottom':
        return {
          top: rect.bottom + 12,
          left: rect.left + rect.width / 2 - width / 2,
        };
      case 'top':
        return {
          top: rect.top - height - 12,
          left: rect.left + rect.width / 2 - width / 2,
        };
      default:
        return {
          top: rect.bottom + 12,
          left: rect.left + rect.width / 2 - width / 2,
        };
    }
  };

  const renderPreview = () => {
    if (!isHovered) return null;

    const previewContent = (
      <div
        className="fixed z-[9999] pointer-events-none"
        style={{
          zIndex: 9999,
          ...getPreviewPosition(),
        }}
      >
        <div className={`${sizeClasses[normalizedSize]} bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden`}>
          {!imageLoaded && !imageError && (
            <div className="w-full h-full flex items-center justify-center bg-gray-50">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          )}

          {imageError && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-500">
              <Eye className="w-12 h-12 mb-2" />
              <span className="text-sm text-center px-4">Preview unavailable</span>
            </div>
          )}

          <img
            src={previewUrl}
            alt="Preview"
            className={`w-full h-full object-contain ${imageLoaded && !imageError ? 'block' : 'hidden'}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </div>
      </div>
    );

    // Use portal for dropdown mode to escape container clipping
    if (dropdownMode && portalContainer) {
      return createPortal(previewContent, portalContainer);
    }

    // For non-dropdown mode, use regular positioning
    return (
      <div className={`absolute z-[9999] ${positionClasses[actualPosition]} pointer-events-none`}>
        <div className={`${sizeClasses[normalizedSize]} bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden`}>
          {!imageLoaded && !imageError && (
            <div className="w-full h-full flex items-center justify-center bg-gray-50">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          )}

          {imageError && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-500">
              <Eye className="w-12 h-12 mb-2" />
              <span className="text-sm text-center px-4">Preview unavailable</span>
            </div>
          )}

          <img
            src={previewUrl}
            alt="Preview"
            className={`w-full h-full object-contain ${imageLoaded && !imageError ? 'block' : 'hidden'}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {renderPreview()}
    </div>
  );
}

interface PreviewIconProps {
  previewUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'small' | 'default' | 'large' | 'raw';
  position?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  dropdownMode?: boolean;
}

export function PreviewIcon({ previewUrl, size = 'default', position = 'auto', className = '', dropdownMode = false }: PreviewIconProps) {
  if (!previewUrl) {
    return null;
  }

  return (
    <ImagePreview
      previewUrl={previewUrl}
      size={size}
      position={position}
      className={className}
      dropdownMode={dropdownMode}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
        title="Preview available - hover to see"
      >
        <Eye className="w-3 h-3" />
      </Button>
    </ImagePreview>
  );
}
