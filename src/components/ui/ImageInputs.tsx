import { X } from 'lucide-react';
import type React from 'react';
import type { KeyboardEvent } from 'react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/libs/utils';

import styles from './ImageInputs.module.css';
import { Input } from './input';

interface ImageInputProps {
  baseTitle: string;
  baseTags?: string[];
  changeTitle: (value: string) => void;
  changeTags: (value: string[]) => void;
}

function ImageInputs({ baseTitle, changeTitle, changeTags, baseTags }: ImageInputProps) {
  const [title, setTitle] = useState(baseTitle);
  const [tags, setTags] = useState<string[]>(baseTags || ['Image']);

  const addTagHandler = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (tags.includes(e.currentTarget.value)) {
        e.currentTarget.value = '';
        return;
      }
      if (e.currentTarget.value === '' || e.currentTarget.value.length === 0) {
        return;
      }
      setTags([...tags, e.currentTarget.value]);
      changeTags([...tags, e.currentTarget.value]);
      e.currentTarget.value = '';
    }
  };

  const removeTagHandler = (tag: string) => {
    setTags(tags.filter((cur) => cur !== tag));
    changeTags(tags.filter((cur) => cur !== tag));
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    changeTitle(e.target.value);
  };

  return (
    <div className={styles.root}>
      <Input
        placeholder="Title"
        value={title}
        onChange={(event) => handleTitleChange(event)}
      />
      <Input
        placeholder="Tags"
        onKeyDown={(e) => addTagHandler(e)}
      />
      <div className={cn('type-sm', styles.tagsLabel)}>
        Tags:
        <div className={styles.tagsWrap}>
          {tags.map((tag) => (
            <Badge
              key={tag}
              className={cn(styles.tag, 'type-truncate')}
              onClick={() => removeTagHandler(tag.toString())}
            >
              <span className="type-xs">{tag}</span>
              <X className={styles.removeIcon} />
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
export default ImageInputs;
