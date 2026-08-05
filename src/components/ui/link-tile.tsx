import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from './card';

interface LinkTileProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

function LinkTile({ href, title, description, icon: Icon }: LinkTileProps) {
  return (
    <Link to={href}>
      <Card className="bg-accent hover:bg-primary/40 transition-colors duration-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-4" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

export default LinkTile;
