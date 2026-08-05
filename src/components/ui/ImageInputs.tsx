import { X } from 'lucide-react';
import type React from 'react';
import type { KeyboardEvent } from 'react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';

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
    <div className="mb-3 flex w-full flex-col gap-1 text-black outline-hidden">
      <Input
        placeholder="Title"
        value={title}
        onChange={(event) => handleTitleChange(event)}
      />
      <Input
        placeholder="Tags"
        onKeyDown={(e) => addTagHandler(e)}
      />
      <div className="text-sm text-foreground">
        Tags:
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge
              key={tag}
              className="group/badge relative cursor-pointer truncate"
              onClick={() => removeTagHandler(tag.toString())}
            >
              <span className="text-xs">{tag}</span>
              <X className="absolute left-[2px] top-[-2px] size-3 font-bold opacity-0 group-hover/badge:opacity-100" />
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
export default ImageInputs;
