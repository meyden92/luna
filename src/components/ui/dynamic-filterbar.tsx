import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, LoaderIcon, SearchIcon, XIcon } from 'lucide-react';
import { type FocusEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { cn } from '@/libs/utils';

// ============================================================================
// Types
// ============================================================================

export interface FilterOperator {
  id: string;
  symbol: string;
  label: string;
}

export const OPERATORS = {
  is: { id: 'is', symbol: '=', label: 'is' },
  is_not: { id: 'is_not', symbol: '!=', label: 'is not' },
  one_of: { id: 'one_of', symbol: '||', label: 'one of' },
  none_of: { id: 'none_of', symbol: '!||', label: 'none of' },
} as const satisfies Record<string, FilterOperator>;

export type OperatorId = keyof typeof OPERATORS;

export interface FilterOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

export interface FilterDefinition<TContext = unknown> {
  key: string;
  label: string;
  icon: LucideIcon;
  operators: FilterOperator[];
  options?: FilterOption[];
  getOptions?: (query: string, ctx: TContext) => FilterOption[];
  fetchOptions?: (query: string, ctx: TContext, signal?: AbortSignal) => Promise<FilterOption[]>;
  getDisplayValue?: (value: string | string[], ctx: TContext) => string;
  /** Zod schema for validating filter values */
  schema?: z.ZodType<string | string[]>;
}

export interface SorterDefinition {
  key: string;
  label: string;
  icon?: LucideIcon;
}

export interface ActiveFilter {
  key: string;
  operator: FilterOperator;
  values: string[];
}

export interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

export interface FilterBarState {
  filters: ActiveFilter[];
  search: string;
  sort: SortState | null;
}

export interface FilterBarTranslations {
  placeholder?: string;
  clearAll?: string;
  search?: string;
  noResults?: string;
  selectValue?: string;
  sortBy?: string;
}

/** Props passed to custom option renderer */
export interface OptionRenderProps {
  option: FilterOption;
  isHighlighted: boolean;
  stage: 'filter' | 'operator' | 'value';
}

/** Props passed to custom badge renderer */
export interface BadgeRenderProps {
  filter: ActiveFilter;
  definition: FilterDefinition<unknown>;
  onRemove: () => void;
  onOperatorChange: (operator: FilterOperator) => void;
}

export interface DynamicFilterBarProps<TContext = unknown> {
  filters: FilterDefinition<TContext>[];
  sorters?: SorterDefinition[];
  defaultSort?: SortState;
  context?: TContext;
  onApply?: (state: FilterBarState) => void;
  onSortChange?: (sort: SortState | null) => void;
  syncToUrl?: boolean;
  placeholder?: string;
  className?: string;
  translations?: FilterBarTranslations;
  /** Controlled mode: external state */
  value?: FilterBarState;
  /** Controlled mode: state change handler */
  onChange?: (state: FilterBarState) => void;
  /** Debounce delay for fetchOptions in ms (default: 300) */
  debounceMs?: number;
  /** Whether to preserve existing URL params when syncing (default: true) */
  preserveUrlParams?: boolean;
  /** Custom renderer for dropdown options */
  renderOption?: (props: OptionRenderProps) => ReactNode;
  /** Custom renderer for filter badges */
  renderBadge?: (props: BadgeRenderProps) => ReactNode;
}

// ============================================================================
// URL Serialization
// ============================================================================

/** Keys that are managed by the filter bar and should be removed when preserving other params */
function getFilterBarKeys(filterDefs: FilterDefinition<unknown>[]): Set<string> {
  const keys = new Set<string>(['search', 'sort', 'sort_dir']);
  for (const def of filterDefs) {
    keys.add(def.key);
    keys.add(`${def.key}[]`);
    keys.add(`${def.key}_op`);
  }
  return keys;
}

function serializeToUrl(
  state: FilterBarState,
  existingParams?: URLSearchParams,
  filterDefs?: FilterDefinition<unknown>[],
  preserveOther = true,
): URLSearchParams {
  const params = new URLSearchParams();

  // Preserve existing params that aren't managed by the filter bar
  if (preserveOther && existingParams && filterDefs) {
    const managedKeys = getFilterBarKeys(filterDefs);
    existingParams.forEach((value, key) => {
      if (!managedKeys.has(key)) {
        params.append(key, value);
      }
    });
  }

  // Search
  if (state.search) {
    params.set('search', state.search);
  }

  // Filters
  for (const filter of state.filters) {
    // If operator is not 'is', include it
    if (filter.operator.id !== 'is') {
      params.set(`${filter.key}_op`, filter.operator.id);
    }

    // Values
    if (filter.values.length === 1 && filter.values[0]) {
      params.set(filter.key, filter.values[0]);
    } else if (filter.values.length > 1) {
      for (const value of filter.values) {
        params.append(`${filter.key}[]`, value);
      }
    }
  }

  // Sort
  if (state.sort) {
    params.set('sort', state.sort.key);
    params.set('sort_dir', state.sort.direction);
  }

  return params;
}

function parseFromUrl(searchParams: URLSearchParams, filterDefs: FilterDefinition<unknown>[], defaultSort?: SortState): FilterBarState {
  const filters: ActiveFilter[] = [];
  const processedKeys = new Set<string>();

  // Parse filters
  for (const def of filterDefs) {
    const key = def.key;
    if (processedKeys.has(key)) continue;

    // Check for array values first
    const arrayValues = searchParams.getAll(`${key}[]`);
    const singleValue = searchParams.get(key);
    const operatorId = searchParams.get(`${key}_op`) || 'is';

    let values: string[] = [];
    if (arrayValues.length > 0) {
      values = arrayValues;
    } else if (singleValue) {
      values = [singleValue];
    }

    if (values.length > 0) {
      const operator = def.operators.find((op) => op.id === operatorId) ?? def.operators[0];
      if (operator) {
        filters.push({ key, operator, values });
        processedKeys.add(key);
      }
    }
  }

  // Parse search
  const search = searchParams.get('search') || '';

  // Parse sort
  const sortKey = searchParams.get('sort');
  const sortDir = searchParams.get('sort_dir') as 'asc' | 'desc' | null;
  const sort = sortKey ? { key: sortKey, direction: sortDir || 'desc' } : defaultSort || null;

  return { filters, search, sort };
}

// ============================================================================
// Reducer
// ============================================================================

type FilterAction =
  | { type: 'SET_FILTER'; filter: ActiveFilter }
  | { type: 'REMOVE_FILTER'; key: string }
  | { type: 'UPDATE_OPERATOR'; key: string; operator: FilterOperator }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SET_SORT'; sort: SortState | null }
  | { type: 'CLEAR_ALL' }
  | { type: 'INIT'; state: FilterBarState };

function filterReducer(state: FilterBarState, action: FilterAction): FilterBarState {
  switch (action.type) {
    case 'SET_FILTER': {
      const existingIndex = state.filters.findIndex((f) => f.key === action.filter.key);
      if (existingIndex >= 0) {
        const newFilters = [...state.filters];
        newFilters[existingIndex] = action.filter;
        return { ...state, filters: newFilters };
      }
      return { ...state, filters: [...state.filters, action.filter] };
    }
    case 'REMOVE_FILTER':
      return { ...state, filters: state.filters.filter((f) => f.key !== action.key) };
    case 'UPDATE_OPERATOR': {
      return {
        ...state,
        filters: state.filters.map((f) => (f.key === action.key ? { ...f, operator: action.operator } : f)),
      };
    }
    case 'SET_SEARCH':
      return { ...state, search: action.search };
    case 'SET_SORT':
      return { ...state, sort: action.sort };
    case 'CLEAR_ALL':
      return { filters: [], search: '', sort: state.sort };
    case 'INIT':
      return action.state;
    default:
      return state;
  }
}

// ============================================================================
// Subcomponents
// ============================================================================

interface FilterBadgeProps {
  filter: ActiveFilter;
  definition: FilterDefinition<unknown>;
  context: unknown;
  onRemove: () => void;
  onOperatorChange: (operator: FilterOperator) => void;
}

function DefaultFilterBadge({ filter, definition, context, onRemove, onOperatorChange }: FilterBadgeProps) {
  const [operatorOpen, setOperatorOpen] = useState(false);

  const displayValue = useMemo(() => {
    if (definition.getDisplayValue) {
      const valueArg = filter.values.length === 1 ? (filter.values[0] ?? '') : filter.values;
      return definition.getDisplayValue(valueArg, context);
    }

    // Look up labels from options
    const labels = filter.values.map((v) => {
      const opt = definition.options?.find((o) => o.value === v);
      return opt?.label || v;
    });

    return labels.join(', ');
  }, [filter.values, definition, context]);

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background py-1 pl-2.5 pr-1.5 text-sm shadow-sm animate-in fade-in zoom-in-95 duration-150">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">{definition.label}</span>

      {/* Operator dropdown */}
      <PopoverPrimitive.Root
        open={operatorOpen}
        onOpenChange={setOperatorOpen}
      >
        <PopoverPrimitive.Trigger className="cursor-pointer rounded px-1.5 py-0.5 font-mono text-xs hover:bg-accent">
          {filter.operator.symbol}
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            side="bottom"
            align="start"
            sideOffset={4}
            className="z-50"
          >
            <PopoverPrimitive.Popup className="bg-popover text-popover-foreground rounded-lg shadow-lg ring-1 ring-foreground/5 p-1 min-w-24 animate-in fade-in slide-in-from-top-1 duration-150">
              {definition.operators.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                    op.id === filter.operator.id && 'bg-accent',
                  )}
                  onClick={() => {
                    onOperatorChange(op);
                    setOperatorOpen(false);
                  }}
                >
                  <span className="font-mono w-6">{op.symbol}</span>
                  <span>{op.label}</span>
                </button>
              ))}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <span className="max-w-[12rem] truncate text-xs font-semibold text-foreground/90">{displayValue}</span>

      <button
        type="button"
        onClick={onRemove}
        className="cursor-pointer rounded p-1 hover:bg-accent"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

interface SortDropdownProps {
  sorters: SorterDefinition[];
  currentSort: SortState | null;
  defaultSort?: SortState;
  onChange: (sort: SortState | null) => void;
  translations?: FilterBarTranslations;
}

function SortDropdown({ sorters, currentSort, defaultSort, onChange, translations }: SortDropdownProps) {
  const [open, setOpen] = useState(false);

  const effectiveSort = currentSort || defaultSort;
  const currentSorter = sorters.find((s) => s.key === effectiveSort?.key);

  const handleSelectSort = useCallback(
    (key: string) => {
      const newSort: SortState = {
        key,
        direction: effectiveSort?.key === key ? effectiveSort.direction : 'desc',
      };
      onChange(newSort);
      setOpen(false);
    },
    [effectiveSort, onChange],
  );

  const toggleDirection = useCallback(() => {
    if (!effectiveSort) return;
    onChange({
      key: effectiveSort.key,
      direction: effectiveSort.direction === 'asc' ? 'desc' : 'asc',
    });
  }, [effectiveSort, onChange]);

  if (sorters.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <PopoverPrimitive.Root
        open={open}
        onOpenChange={setOpen}
      >
        <PopoverPrimitive.Trigger className="flex cursor-pointer items-center gap-1 rounded-lg border border-border/65 bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent">
          <span className="text-muted-foreground">{translations?.sortBy || 'Sort:'}</span>
          <span>{currentSorter?.label || 'Select'}</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            side="bottom"
            align="end"
            sideOffset={4}
            className="z-50"
          >
            <PopoverPrimitive.Popup className="bg-popover text-popover-foreground rounded-lg shadow-lg ring-1 ring-foreground/5 p-1 min-w-36 animate-in fade-in slide-in-from-top-1 duration-150">
              {sorters.map((sorter) => {
                const Icon = sorter.icon;
                return (
                  <button
                    key={sorter.key}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                      effectiveSort?.key === sorter.key && 'bg-accent',
                    )}
                    onClick={() => handleSelectSort(sorter.key)}
                  >
                    {Icon && <Icon className="size-4 text-muted-foreground" />}
                    <span>{sorter.label}</span>
                  </button>
                );
              })}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {effectiveSort && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg border border-border/65 bg-background shadow-sm"
          onClick={toggleDirection}
          title={effectiveSort.direction === 'asc' ? 'Ascending' : 'Descending'}
        >
          {effectiveSort.direction === 'asc' ? <ArrowUpIcon className="size-4" /> : <ArrowDownIcon className="size-4" />}
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

type InputStage = 'filter' | 'operator' | 'value';

export function DynamicFilterBar<TContext = unknown>({
  filters,
  sorters = [],
  defaultSort,
  context,
  onApply,
  onSortChange,
  syncToUrl = true,
  placeholder = 'Filter or search...',
  className,
  translations,
  value: controlledValue,
  onChange: controlledOnChange,
  debounceMs = 300,
  preserveUrlParams = true,
  renderOption,
  renderBadge,
}: DynamicFilterBarProps<TContext>) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const searchObj = useSearch({ strict: false }) as Record<string, string | string[] | undefined>;
  const searchParams = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchObj ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, String(v));
      } else {
        params.set(key, String(value));
      }
    }
    return params;
  }, [searchObj]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine if we're in controlled mode
  const isControlled = controlledValue !== undefined;

  // Lazy initializer for useReducer - only runs once on mount
  const createInitialState = useCallback(
    (params: { syncToUrl: boolean; searchParams: URLSearchParams | null }): FilterBarState => {
      if (params.syncToUrl && params.searchParams) {
        return parseFromUrl(params.searchParams, filters as FilterDefinition<unknown>[], defaultSort);
      }
      return { filters: [], search: '', sort: defaultSort || null };
    },
    [filters, defaultSort],
  );

  const [internalState, dispatch] = useReducer(filterReducer, { syncToUrl, searchParams }, createInitialState);

  // Use controlled value if provided, otherwise use internal state
  const state = isControlled ? controlledValue : internalState;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [stage, setStage] = useState<InputStage>('filter');
  const [selectedFilter, setSelectedFilter] = useState<FilterDefinition<unknown> | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<FilterOperator | null>(null);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [asyncOptions, setAsyncOptions] = useState<FilterOption[]>([]);
  const [isLoadingAsync, setIsLoadingAsync] = useState(false);
  const initialApplyDone = useRef(false);

  // Wrapper to handle both controlled and uncontrolled state updates
  const updateState = useCallback(
    (action: FilterAction) => {
      if (isControlled) {
        // In controlled mode, compute new state and call onChange
        const newState = filterReducer(controlledValue, action);
        controlledOnChange?.(newState);
      } else {
        dispatch(action);
      }
    },
    [isControlled, controlledValue, controlledOnChange],
  );

  // Notify parent of initial state on mount (only once)
  useEffect(() => {
    if (initialApplyDone.current) return;
    initialApplyDone.current = true;

    if (state.filters.length > 0 || state.search) {
      onApply?.(state);
    }
  }, [state, onApply]);

  // Auto-apply when filters or search change (after initial mount)
  const prevFiltersRef = useRef(state.filters);
  const prevSearchRef = useRef(state.search);
  useEffect(() => {
    if (!initialApplyDone.current) return;
    if (prevFiltersRef.current === state.filters && prevSearchRef.current === state.search) return;
    prevFiltersRef.current = state.filters;
    prevSearchRef.current = state.search;

    if (syncToUrl) {
      const params = serializeToUrl(state, searchParams ?? undefined, filters as FilterDefinition<unknown>[], preserveUrlParams);
      navigate({ to: pathname, search: Object.fromEntries(params), replace: true });
    }
    onApply?.(state);
  }, [state, syncToUrl, searchParams, filters, preserveUrlParams, pathname, navigate, onApply]);

  // Cleanup abort controller and debounce timer on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
    };
  }, []);

  // Available filters (exclude already active)
  const activeFilterKeys = useMemo(() => state.filters.map((f) => f.key), [state.filters]);
  const availableFilters = useMemo(
    () => (filters as FilterDefinition<unknown>[]).filter((f) => !activeFilterKeys.includes(f.key)),
    [filters, activeFilterKeys],
  );

  // Filter suggestions based on input
  const filteredFilters = useMemo(() => {
    if (!inputValue) return availableFilters;
    const lower = inputValue.toLowerCase();
    return availableFilters.filter((f) => f.label.toLowerCase().includes(lower) || f.key.toLowerCase().includes(lower));
  }, [availableFilters, inputValue]);

  // Get options for current stage
  const currentOptions = useMemo((): { value: string; label: string; icon?: LucideIcon }[] => {
    if (stage === 'filter') {
      return filteredFilters.map((f) => ({ value: f.key, label: f.label, icon: f.icon }));
    }
    if (stage === 'operator' && selectedFilter) {
      return selectedFilter.operators.map((op) => ({
        value: op.id,
        label: `${op.symbol} ${op.label}`,
      }));
    }
    if (stage === 'value' && selectedFilter) {
      // Async options
      if (asyncOptions.length > 0 || isLoadingAsync) {
        const lower = inputValue.toLowerCase();
        return asyncOptions.filter(
          (o) => !selectedValues.includes(o.value) && (o.label.toLowerCase().includes(lower) || o.value.toLowerCase().includes(lower)),
        );
      }

      // Dynamic options
      if (selectedFilter.getOptions) {
        return selectedFilter.getOptions(inputValue, context).filter((o) => !selectedValues.includes(o.value));
      }

      // Static options
      if (selectedFilter.options) {
        const lower = inputValue.toLowerCase();
        return selectedFilter.options.filter(
          (o) => !selectedValues.includes(o.value) && (o.label.toLowerCase().includes(lower) || o.value.toLowerCase().includes(lower)),
        );
      }
    }
    return [];
  }, [stage, filteredFilters, selectedFilter, inputValue, context, selectedValues, asyncOptions, isLoadingAsync]);

  // Fetch async options with debounce and AbortController
  useEffect(() => {
    if (stage !== 'value' || !selectedFilter?.fetchOptions) return;

    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Abort any in-flight request
    abortControllerRef.current?.abort();

    setIsLoadingAsync(true);

    // Debounce the fetch
    debounceTimerRef.current = setTimeout(() => {
      // Re-check inside timeout as selectedFilter could have changed
      if (!selectedFilter?.fetchOptions) {
        setIsLoadingAsync(false);
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      selectedFilter
        .fetchOptions(inputValue, context, controller.signal)
        .then((opts) => {
          if (!controller.signal.aborted) {
            setAsyncOptions(opts);
            setIsLoadingAsync(false);
          }
        })
        .catch((err) => {
          // Ignore abort errors
          if (err instanceof Error && err.name === 'AbortError') return;
          if (!controller.signal.aborted) {
            setIsLoadingAsync(false);
          }
        });
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      abortControllerRef.current?.abort();
    };
  }, [stage, selectedFilter, inputValue, context, debounceMs]);

  // Clamp highlightedIndex when options change
  useEffect(() => {
    if (highlightedIndex >= currentOptions.length && currentOptions.length > 0) {
      setHighlightedIndex(currentOptions.length - 1);
    } else if (currentOptions.length === 0) {
      setHighlightedIndex(0);
    }
  }, [currentOptions.length, highlightedIndex]);

  const clearSearchDebounce = useCallback(() => {
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }
  }, []);

  const resetInput = useCallback(() => {
    clearSearchDebounce();
    setInputValue('');
    setStage('filter');
    setSelectedFilter(null);
    setSelectedOperator(null);
    setSelectedValues([]);
    setAsyncOptions([]);
    setHighlightedIndex(0);
  }, [clearSearchDebounce]);

  // Click-outside handler to close dropdown
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // If we have multi-value selection in progress, apply it
        if (stage === 'value' && selectedValues.length > 0 && selectedFilter && selectedOperator) {
          updateState({
            type: 'SET_FILTER',
            filter: {
              key: selectedFilter.key,
              operator: selectedOperator,
              values: selectedValues,
            },
          });
          resetInput();
        }
        setDropdownOpen(false);
      }
    };

    // Use mousedown to fire before blur
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen, stage, selectedValues, selectedFilter, selectedOperator, resetInput, updateState]);

  const handleSelectFilter = useCallback(
    (filter: FilterDefinition<unknown>) => {
      clearSearchDebounce();
      setSelectedFilter(filter);
      setInputValue('');
      setHighlightedIndex(0);
      // If only one operator, skip operator selection
      if (filter.operators.length === 1 && filter.operators[0]) {
        setSelectedOperator(filter.operators[0]);
        setStage('value');
      } else {
        setStage('operator');
      }
    },
    [clearSearchDebounce],
  );

  const handleSelectOperator = useCallback((operator: FilterOperator) => {
    setSelectedOperator(operator);
    setInputValue('');
    setHighlightedIndex(0);
    setStage('value');
  }, []);

  const handleSelectValue = useCallback(
    (value: string) => {
      if (!selectedFilter || !selectedOperator) return;

      const isMultiValue = selectedOperator.id === 'one_of' || selectedOperator.id === 'none_of';

      if (isMultiValue) {
        const newValues = [...selectedValues, value];
        setSelectedValues(newValues);
        setInputValue('');
        setHighlightedIndex(0);
        // Stay in value stage for more selections
      } else {
        // Validate if schema is provided
        if (selectedFilter.schema) {
          const result = selectedFilter.schema.safeParse(value);
          if (!result.success) {
            // Validation failed - could show error but for now just skip
            return;
          }
        }

        // Single value - add filter to pending state
        updateState({
          type: 'SET_FILTER',
          filter: {
            key: selectedFilter.key,
            operator: selectedOperator,
            values: [value],
          },
        });
        resetInput();
        setDropdownOpen(false);
      }
    },
    [selectedFilter, selectedOperator, selectedValues, resetInput, updateState],
  );

  const handleApplyMultiValue = useCallback(() => {
    if (!selectedFilter || !selectedOperator || selectedValues.length === 0) return;

    // Validate if schema is provided
    if (selectedFilter.schema) {
      const result = selectedFilter.schema.safeParse(selectedValues);
      if (!result.success) {
        // Validation failed - could show error but for now just skip
        return;
      }
    }

    updateState({
      type: 'SET_FILTER',
      filter: {
        key: selectedFilter.key,
        operator: selectedOperator,
        values: selectedValues,
      },
    });
    resetInput();
    setDropdownOpen(false);
  }, [selectedFilter, selectedOperator, selectedValues, resetInput, updateState]);

  const handleRemoveFilter = useCallback(
    (key: string) => {
      updateState({ type: 'REMOVE_FILTER', key });
    },
    [updateState],
  );

  const handleUpdateOperator = useCallback(
    (key: string, operator: FilterOperator) => {
      updateState({ type: 'UPDATE_OPERATOR', key, operator });
    },
    [updateState],
  );

  const handleSetSearch = useCallback(
    (search: string) => {
      updateState({ type: 'SET_SEARCH', search });
    },
    [updateState],
  );

  const handleInputChange = useCallback(
    (next: string) => {
      setInputValue(next);
      setHighlightedIndex(0);
      if (!dropdownOpen) setDropdownOpen(true);

      if (stage !== 'filter') return;

      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }

      const trimmed = next.trim();
      const matchesFilterSuggestion = availableFilters.some((filter) => {
        const lower = trimmed.toLowerCase();
        return lower && (filter.label.toLowerCase().includes(lower) || filter.key.toLowerCase().includes(lower));
      });

      if (trimmed && matchesFilterSuggestion) return;

      searchDebounceTimerRef.current = setTimeout(() => {
        handleSetSearch(trimmed);
        setInputValue('');
        setDropdownOpen(false);
      }, debounceMs);
    },
    [availableFilters, debounceMs, dropdownOpen, handleSetSearch, stage],
  );

  const handleClearAll = useCallback(() => {
    updateState({ type: 'CLEAR_ALL' });
    resetInput();
  }, [resetInput, updateState]);

  // Apply filters - update URL and notify parent
  // Sort changes apply immediately
  const handleSortChange = useCallback(
    (sort: SortState | null) => {
      updateState({ type: 'SET_SORT', sort });
      const newState = { ...state, sort };
      if (syncToUrl) {
        const params = serializeToUrl(newState, searchParams ?? undefined, filters as FilterDefinition<unknown>[], preserveUrlParams);
        navigate({ to: pathname, search: Object.fromEntries(params), replace: true });
      }
      onSortChange?.(sort);
    },
    [state, syncToUrl, pathname, navigate, onSortChange, updateState, searchParams, filters, preserveUrlParams],
  );

  // Handle blur - apply multi-value selection if focus leaves container
  const handleContainerBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      // Check if focus is moving outside the container
      const relatedTarget = e.relatedTarget as Node | null;
      if (containerRef.current && relatedTarget && containerRef.current.contains(relatedTarget)) {
        // Focus is still within container, don't close
        return;
      }

      // If we have multi-value selection in progress, apply it
      if (stage === 'value' && selectedValues.length > 0 && selectedFilter && selectedOperator) {
        updateState({
          type: 'SET_FILTER',
          filter: {
            key: selectedFilter.key,
            operator: selectedOperator,
            values: selectedValues,
          },
        });
        resetInput();
      }
      setDropdownOpen(false);
    },
    [stage, selectedValues, selectedFilter, selectedOperator, resetInput, updateState],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Dispatch highlighted option into the appropriate stage handler
      const selectHighlighted = () => {
        const selected = currentOptions[highlightedIndex];
        if (!selected) return;
        if (stage === 'filter') {
          const filter = availableFilters.find((f) => f.key === selected.value);
          if (filter) handleSelectFilter(filter);
        } else if (stage === 'operator' && selectedFilter) {
          const operator = selectedFilter.operators.find((op) => op.id === selected.value);
          if (operator) handleSelectOperator(operator);
        } else if (stage === 'value') {
          handleSelectValue(selected.value);
        }
      };

      const handleEscape = () => {
        setDropdownOpen(false);
        resetInput();
      };

      const handleTab = () => {
        if (!dropdownOpen || currentOptions.length === 0) return;
        e.preventDefault();
        selectHighlighted();
      };

      const handleEnter = () => {
        e.preventDefault();

        // Multi-value stage with pending selections: apply them
        if (stage === 'value' && selectedValues.length > 0) {
          handleApplyMultiValue();
          return;
        }

        // Select the highlighted option if any
        if (currentOptions.length > 0 && highlightedIndex < currentOptions.length) {
          selectHighlighted();
          return;
        }

        // No options matched — treat input as text search
        if (inputValue.trim() && stage === 'filter') {
          clearSearchDebounce();
          handleSetSearch(inputValue.trim());
          setInputValue('');
          setDropdownOpen(false);
        }
      };

      const handleArrowDown = () => {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, currentOptions.length - 1));
      };

      const handleArrowUp = () => {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      };

      const handleBackspace = () => {
        if (inputValue) return; // only act when input is empty
        if (stage === 'value') {
          if (selectedValues.length > 0) {
            setSelectedValues((v) => v.slice(0, -1));
          } else if (selectedFilter?.operators.length === 1) {
            setStage('filter');
            setSelectedFilter(null);
            setSelectedOperator(null);
          } else {
            setStage('operator');
            setSelectedOperator(null);
          }
        } else if (stage === 'operator') {
          setStage('filter');
          setSelectedFilter(null);
        } else if (stage === 'filter') {
          if (state.filters.length > 0) {
            const lastFilter = state.filters[state.filters.length - 1];
            if (lastFilter) {
              updateState({ type: 'REMOVE_FILTER', key: lastFilter.key });
            }
          } else if (state.search) {
            clearSearchDebounce();
            updateState({ type: 'SET_SEARCH', search: '' });
          }
        }
      };

      switch (e.key) {
        case 'Escape':
          return handleEscape();
        case 'Tab':
          if (!e.shiftKey) {
            handleTab();
            return;
          }
          break;
        case 'Enter':
          return handleEnter();
        case 'ArrowDown':
          return handleArrowDown();
        case 'ArrowUp':
          return handleArrowUp();
        case 'Backspace':
          return handleBackspace();
      }
    },
    [
      stage,
      selectedValues,
      currentOptions,
      highlightedIndex,
      inputValue,
      availableFilters,
      selectedFilter,
      state.filters,
      state.search,
      dropdownOpen,
      handleSelectFilter,
      handleSelectOperator,
      handleSelectValue,
      handleApplyMultiValue,
      handleSetSearch,
      clearSearchDebounce,
      resetInput,
      updateState,
    ],
  );

  // Build input prefix display for current selection
  const inputPrefix = useMemo(() => {
    const parts: string[] = [];
    if (selectedFilter) {
      parts.push(selectedFilter.label);
    }
    if (selectedOperator) {
      parts.push(selectedOperator.symbol);
    }
    if (selectedValues.length > 0) {
      parts.push(selectedValues.join(', '));
    }
    return parts.length > 0 ? `${parts.join(' ')} ` : '';
  }, [selectedFilter, selectedOperator, selectedValues]);

  const hasFilters = state.filters.length > 0 || state.search;

  return (
    <div
      ref={containerRef}
      className={cn('flex items-center gap-2', className)}
      onBlur={handleContainerBlur}
    >
      {/* Main filter input area - GitLab style with badges inside */}
      <div className="flex-1 relative">
        <div
          className="flex min-h-11 cursor-text flex-wrap items-center gap-1 rounded-lg border border-border/65 bg-background px-3 py-2 shadow-sm transition-all focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-ring"
          onClick={() => {
            inputRef.current?.focus();
            setDropdownOpen(true);
          }}
        >
          <SearchIcon className="size-4 text-muted-foreground shrink-0" />

          {/* Search badge */}
          {state.search && (
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background py-1 pl-2.5 pr-1.5 text-xs shadow-sm">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">Search</span>
              <span className="max-w-[12rem] truncate font-semibold">{state.search}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearSearchDebounce();
                  handleSetSearch('');
                }}
                className="cursor-pointer rounded p-1 hover:bg-accent"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          )}

          {/* Filter badges */}
          {state.filters.map((filter) => {
            const def = (filters as FilterDefinition<unknown>[]).find((f) => f.key === filter.key);
            if (!def) return null;

            const badgeProps: BadgeRenderProps = {
              filter,
              definition: def,
              onRemove: () => handleRemoveFilter(filter.key),
              onOperatorChange: (op) => handleUpdateOperator(filter.key, op),
            };

            if (renderBadge) {
              return <div key={filter.key}>{renderBadge(badgeProps)}</div>;
            }

            return (
              <DefaultFilterBadge
                key={filter.key}
                filter={filter}
                definition={def}
                context={context}
                onRemove={badgeProps.onRemove}
                onOperatorChange={badgeProps.onOperatorChange}
              />
            );
          })}

          {/* Current selection prefix */}
          {inputPrefix && <span className="whitespace-nowrap text-xs text-muted-foreground">{inputPrefix}</span>}

          {/* Loading spinner */}
          {isLoadingAsync && <LoaderIcon className="size-4 text-muted-foreground animate-spin shrink-0" />}

          {/* Input */}
          <input
            ref={inputRef}
            data-filterbar-input
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setDropdownOpen(true)}
            placeholder={!hasFilters && !inputPrefix ? placeholder : ''}
            className="h-7 min-w-24 flex-1 bg-transparent text-sm outline-none"
          />

          {/* Clear all button inside input */}
          {hasFilters && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              className="shrink-0 cursor-pointer rounded p-1 hover:bg-accent"
              title={translations?.clearAll || 'Clear all'}
            >
              <XIcon className="size-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {dropdownOpen && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-lg border border-border/60 bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-foreground/5 animate-in fade-in slide-in-from-top-2 duration-150"
            onMouseDown={(e) => e.preventDefault()} // Prevent blur on click
          >
            {isLoadingAsync && currentOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <LoaderIcon className="size-4 animate-spin" />
                Loading...
              </div>
            )}

            {!isLoadingAsync && currentOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {stage === 'filter' ? translations?.noResults || 'No filters available' : translations?.noResults || 'No options found'}
              </div>
            )}

            {currentOptions.map((option, index) => {
              const Icon = option.icon;
              const isHighlighted = index === highlightedIndex;

              const handleClick = () => {
                if (stage === 'filter') {
                  const filter = availableFilters.find((f) => f.key === option.value);
                  if (filter) handleSelectFilter(filter);
                } else if (stage === 'operator' && selectedFilter) {
                  const operator = selectedFilter.operators.find((op) => op.id === option.value);
                  if (operator) handleSelectOperator(operator);
                } else if (stage === 'value') {
                  handleSelectValue(option.value);
                }
                inputRef.current?.focus();
              };

              if (renderOption) {
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm',
                      isHighlighted ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                    onClick={handleClick}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {renderOption({ option, isHighlighted, stage })}
                  </button>
                );
              }

              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm',
                    isHighlighted ? 'bg-accent' : 'hover:bg-accent/50',
                  )}
                  onClick={handleClick}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {Icon && <Icon className="size-4 text-muted-foreground" />}
                  <span>{option.label}</span>
                </button>
              );
            })}

            {/* Multi-value: show apply button */}
            {stage === 'value' && selectedValues.length > 0 && (
              <>
                <div className="border-t my-1" />
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    handleApplyMultiValue();
                    inputRef.current?.focus();
                  }}
                >
                  Add ({selectedValues.length} selected)
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sort dropdown */}
      {sorters.length > 0 && (
        <SortDropdown
          sorters={sorters}
          currentSort={state.sort}
          defaultSort={defaultSort}
          onChange={handleSortChange}
          translations={translations}
        />
      )}
    </div>
  );
}

export default DynamicFilterBar;
