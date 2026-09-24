import { Link } from '@tanstack/react-router';
import { ImageIcon, Plus } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/libs/utils';
import { type AiTemplate, resolveTemplateVariables, templatePreviewImages } from './template-data';
import styles from './template-gallery.module.css';

interface TemplateGalleryProps {
  templates: AiTemplate[];
  onOpen: (templateId: string) => void;
}

/** Keeps the mint spotlight under the cursor without re-rendering the card. */
function trackSpotlight(event: React.PointerEvent<HTMLElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--mx', `${event.clientX - bounds.left}px`);
  event.currentTarget.style.setProperty('--my', `${event.clientY - bounds.top}px`);
}

/**
 * The Templates tab before a template is chosen. There is no separate empty
 * state: with nothing built yet the dashed "New template" card is the only card,
 * and it is exactly the one thing a first-time visitor needs.
 */
function TemplateGallery({ templates, onOpen }: TemplateGalleryProps) {
  return (
    <div className={styles.grid}>
      {templates.map((template, index) => {
        const cover = templatePreviewImages(template)[0];
        const options = resolveTemplateVariables(template).length;

        return (
          <button
            key={template.id}
            type="button"
            className={styles.card}
            // Runtime value: cards reveal one after another as the gallery appears.
            style={{ animationDelay: `${index * 60}ms` }}
            onPointerMove={trackSpotlight}
            onClick={() => onOpen(template.id)}
          >
            <div className={styles.cover}>
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <ImageIcon
                  className={styles.coverIcon}
                  size={20}
                />
              )}
            </div>
            <div className={styles.body}>
              <b className={styles.name}>{template.name}</b>
              {template.description && <span className={styles.description}>{template.description}</span>}
              <span className={styles.meta}>
                {template.inputImageCount === 1 ? '1 photo' : `Up to ${template.inputImageCount} photos`} ·{' '}
                {options === 1 ? '1 option' : `${options} options`}
              </span>
            </div>
          </button>
        );
      })}

      <Link
        to="/admin/templates/create"
        className={cn(styles.card, styles.new)}
        // Runtime value: it is the last card, so it rises after the real ones.
        style={{ animationDelay: `${templates.length * 60}ms` }}
        onPointerMove={trackSpotlight}
      >
        <Plus size={18} />
        New template
      </Link>
    </div>
  );
}

export { TemplateGallery };
