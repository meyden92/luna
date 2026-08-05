import { createFileRoute } from '@tanstack/react-router';
import { ConverterTool } from '@/components/converter/ConverterTool';

export const Route = createFileRoute('/_dashboard/tools/converter')({
  head: () => ({ meta: [{ title: 'Converter | LunaShare' }] }),
  component: ConverterTool,
});
