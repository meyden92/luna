import { Badge } from '@/components/ui/badge';
import { cn } from '@/libs/utils';

interface ViewTagListProps {
  tags: string[];
}

function ViewTagList({ tags }: ViewTagListProps) {
  if (tags.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap')}>
      <div className="w-full">
        <h3 className="text-lg font-bold">Tags</h3>
        {tags.map((tag) => (
          <Badge
            className="ml-1 max-w-[125px] truncate"
            key={tag}
          >
            {tag.length > 10 ? `${tag.slice(0, 10)}...` : tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export default ViewTagList;
