import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { LayoutTemplate, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import styles from './ModelList.module.css';
import { studioTemplatesQueryOptions } from './queries';

/** Every Studio Template, by Category, with the entry point for creating one. */
export function TemplateList() {
  const { data: templates } = useSuspenseQuery(studioTemplatesQueryOptions);

  return (
    <div className="stack space-6">
      <div className={styles.header}>
        <div>
          <h1 className="cluster space-2 type-2xl weight-bold">
            <LayoutTemplate className={styles.titleIcon} />
            Studio templates
          </h1>
          <p className={styles.muted}>Models with a written prompt, asking Users only for the Variables you chose.</p>
        </div>
        <Link
          to="/admin/studio/templates/new"
          className={buttonVariants({})}
        >
          <Plus />
          New template
        </Link>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Variables</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <Link
                      to="/admin/studio/templates/$id"
                      params={{ id: template.id }}
                      className={styles.link}
                    >
                      {template.name}
                    </Link>
                  </TableCell>
                  <TableCell>{template.modelName}</TableCell>
                  <TableCell>{template.categoryName}</TableCell>
                  <TableCell>{template.variables.length}</TableCell>
                  <TableCell>
                    <Badge variant={template.isActive ? 'default' : 'secondary'}>{template.isActive ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {templates.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className={styles.empty}
                  >
                    No templates yet. Create one, or use Save as Template on a Generation in the Studio.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
