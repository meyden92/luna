import { Link } from '@tanstack/react-router';
import { ImageIcon, Plus } from 'lucide-react';
import type * as React from 'react';
import { CanvasEmpty } from './canvas';
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

/** The Templates tab before a template is chosen. */
function TemplateGallery({ templates, onOpen }: TemplateGalleryProps) {
  if (templates.length === 0) {
    return (
      <CanvasEmpty
        title="No templates yet"
        description="A template turns a photo plus a few options into a finished image. Build one to get started."
      />
    );
  }

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
        className={styles.new}
      >
        <Plus size={18} />
        New template
      </Link>
    </div>
  );
}

export { TemplateGallery };
