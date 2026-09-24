import {
  ClipboardList,
  Clock,
  Eye,
  Filter,
  FlaskConical,
  FolderInput,
  Lock,
  MoreHorizontal,
  Play,
  Plus,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  createStep,
  incompleteReason,
  type LinearFlow,
  orderSteps,
  STEP_LABELS,
  type StepNode,
  type StepType,
  summarizeFlow,
  type TriggerType,
} from '@/libs/flows/linear-flow';
import { startViewTransition } from '@/libs/view-transition';
import styles from './AutomationDetail.module.css';
import { StepCard } from './StepCard';
import { type FolderOption, StepFields, TriggerField } from './StepFields';

const TRIGGER_ICONS: Record<TriggerType, typeof Upload> = {
  upload: Upload,
  view: Eye,
  'form-submit': ClipboardList,
  schedule: Clock,
  manual: Play,
};

const STEP_ICONS: Record<StepType, typeof Upload> = {
  condition: Filter,
  'route-folder': FolderInput,
  tag: Tag,
  privacy: Lock,
};

/** The "+ Add step" menu, grouped so a filter never reads as an action. */
const STEP_MENU: { group: string; items: { type: StepType; label: string }[] }[] = [
  { group: 'Filter', items: [{ type: 'condition', label: 'Only if…' }] },
  {
    group: 'Actions',
    items: [
      { type: 'route-folder', label: STEP_LABELS['route-folder'] },
      { type: 'tag', label: STEP_LABELS.tag },
      { type: 'privacy', label: STEP_LABELS.privacy },
    ],
  },
];

type AutomationDetailProps = {
  name: string;
  enabled: boolean;
  flow: LinearFlow;
  folders: FolderOption[];
  deleting: boolean;
  onNameChange: (name: string) => void;
  onEnabledChange: (enabled: boolean) => void;
  onFlowChange: (flow: LinearFlow) => void;
  onDelete: () => void;
};

/**
 * The detail pane: what the automation reads as in one sentence, then the chain
 * that produces it — a trigger card and one card per step, joined by connectors
 * whose glow travels while the automation is on and stands still while paused.
 */
function AutomationDetail({
  name,
  enabled,
  flow,
  folders,
  deleting,
  onNameChange,
  onEnabledChange,
  onFlowChange,
  onDelete,
}: AutomationDetailProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const steps = useMemo(() => orderSteps(flow.steps), [flow.steps]);
  const summary = useMemo(() => summarizeFlow(flow, (folderId) => folders.find((folder) => folder.id === folderId)?.name), [flow, folders]);
  const incomplete = incompleteReason({ name, steps });
  const TriggerIcon = TRIGGER_ICONS[flow.trigger];

  // Adding and removing a step re-flows the whole column, so both run as a page
  // transition; editing a field in place does not.
  const addStep = (type: StepType) => {
    const step = createStep(type, folders[0]?.id);
    // `orderSteps` keeps conditions ahead of actions, so a filter added last still
    // runs before the move and tag steps already in the chain.
    startViewTransition(() => onFlowChange({ ...flow, steps: orderSteps([...steps, step]) }), 'page');
  };
  const removeStep = (id: string) =>
    startViewTransition(() => onFlowChange({ ...flow, steps: steps.filter((step) => step.id !== id) }), 'page');
  const updateStep = (next: StepNode) => onFlowChange({ ...flow, steps: steps.map((step) => (step.id === next.id ? next : step)) });

  const testButton = (
    <Button
      size="sm"
      variant="outline"
      disabled={steps.length === 0}
      onClick={() => toast('Test run on the latest upload: 1 file matched', { icon: <FlaskConical aria-hidden /> })}
    >
      <FlaskConical />
      Test on last upload
    </Button>
  );

  return (
    <section
      className={styles.root}
      data-paused={enabled ? undefined : ''}
    >
      <div className={styles.bar}>
        <input
          value={name}
          maxLength={120}
          aria-label="Automation name"
          className={styles.name}
          onChange={(event) => onNameChange(event.target.value)}
        />
        {steps.length === 0 ? (
          // A disabled button swallows its own hover, so the tooltip hangs off a wrapper.
          <Tooltip>
            <TooltipTrigger render={<span />}>{testButton}</TooltipTrigger>
            <TooltipContent>Add a step first — there is nothing to test yet.</TooltipContent>
          </Tooltip>
        ) : (
          testButton
        )}
        <span className={styles.state}>
          {enabled ? 'On' : 'Paused'}
          <Switch
            checked={enabled}
            aria-label="Turn this automation on or off"
            onCheckedChange={onEnabledChange}
          />
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="More"
              />
            }
          >
            <MoreHorizontal size={15} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className={styles.body}>
        <div className={styles.chain}>
          <p className={styles.summary}>
            {summary.parts.map((part) => (
              <Fragment key={part.id}>
                {part.lead}
                <b className={styles.summaryValue}>{part.value}</b>
              </Fragment>
            ))}
            {summary.tail}
          </p>

          <StepCard
            tone="trigger"
            kind="When"
            icon={<TriggerIcon size={16} />}
          >
            <TriggerField
              value={flow.trigger}
              onChange={(trigger) => onFlowChange({ ...flow, trigger })}
            />
          </StepCard>

          {steps.map((step) => {
            const StepIcon = STEP_ICONS[step.type];
            return (
              <Fragment key={step.id}>
                <div className={styles.connector} />
                <StepCard
                  kind={STEP_LABELS[step.type]}
                  icon={<StepIcon size={16} />}
                  vtName={`step-${step.id}`}
                  onRemove={() => removeStep(step.id)}
                >
                  <StepFields
                    step={step}
                    folders={folders}
                    onChange={updateStep}
                  />
                </StepCard>
              </Fragment>
            );
          })}

          <div className={styles.connector} />
          <div className={styles.add}>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                  />
                }
              >
                <Plus />
                Add step
              </DropdownMenuTrigger>
              <DropdownMenuContent className={styles.addMenu}>
                {STEP_MENU.map((section) => (
                  <DropdownMenuGroup key={section.group}>
                    <DropdownMenuLabel>{section.group}</DropdownMenuLabel>
                    {section.items.map((item) => {
                      const ItemIcon = STEP_ICONS[item.type];
                      return (
                        <DropdownMenuItem
                          key={item.type}
                          onClick={() => addStep(item.type)}
                        >
                          <ItemIcon />
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {incomplete ? <p className={styles.incomplete}>{incomplete}</p> : null}
        </div>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this automation?</AlertDialogTitle>
            <AlertDialogDescription>It stops running immediately. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export { AutomationDetail };
