import { Badge } from '@/components/ui/badge';
import styles from './ViewTagList.module.css';

interface ViewTagListProps {
  tags: string[];
}

function ViewTagList({ tags }: ViewTagListProps) {
  if (tags.length === 0) return null;
  return (
    <div className={styles.root}>
      <div className={styles.column}>
        <h3 className={styles.heading}>Tags</h3>
        {tags.map((tag) => (
          <Badge
            className={styles.tag}
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
