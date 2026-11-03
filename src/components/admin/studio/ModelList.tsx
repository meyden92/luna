import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPrice } from '@/libs/studio/format';
import { AddModelDialog } from './AddModelDialog';
import styles from './ModelList.module.css';
import { studioModelsQueryOptions } from './queries';

/** Every Studio Model, by Category, with the entry point for adding one from the fal catalog. */
export function ModelList() {
  const { data: models } = useSuspenseQuery(studioModelsQueryOptions);
  const [adding, setAdding] = useState(false);

  return (
    <div className="stack space-6">
      <div className={styles.header}>
        <div>
          <h1 className="cluster space-2 type-2xl weight-bold">
            <Sparkles className={styles.titleIcon} />
            Studio models
          </h1>
          <p className={styles.muted}>fal Models Users can run in the Studio, each with the inputs you chose to show.</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus />
          Add model
        </Button>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <Link
                      to="/admin/studio/models/$id"
                      params={{ id: model.id }}
                      className={styles.link}
                    >
                      {model.name}
                    </Link>
                  </TableCell>
                  <TableCell className="type-mono type-xs">{model.endpointId}</TableCell>
                  <TableCell>{model.categoryName}</TableCell>
                  <TableCell>{model.pricing ? formatPrice(model.pricing) : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={model.isActive ? 'default' : 'secondary'}>{model.isActive ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {models.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className={styles.empty}
                  >
                    No models yet. Add one from the fal catalog.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {adding && <AddModelDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
