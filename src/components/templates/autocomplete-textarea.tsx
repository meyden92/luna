import { Maximize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PromptExpandDialog } from '@/components/ai/editor/PromptExpandDialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/libs/utils';
import type { TemplateVariable } from '@/types/template';

interface AutocompleteTextareaProps {
  value: string;
  onChange: (value: string) => void;
  variables: TemplateVariable[];
  placeholder?: string;
  className?: string;
  expandDialogTitle?: string;
}

export function AutocompleteTextarea({
  value,
  onChange,
  variables,
  placeholder,
  className,
  expandDialogTitle = 'Edit Prompt',
}: AutocompleteTextareaProps) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [showVariableList, setShowVariableList] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isExpandDialogOpen, setIsExpandDialogOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const enabledVariables = useMemo(() => variables.filter((v) => v.enabled !== false && v.name.trim() !== ''), [variables]);

  // Filter variables based on text after '{'
  const filteredVariables = useMemo(
    () =>
      enabledVariables.filter(
        (v) => v.name.toLowerCase().includes(filterText.toLowerCase()) || v.label.toLowerCase().includes(filterText.toLowerCase()),
      ),
    [enabledVariables, filterText],
  );

  useEffect(() => {
    const handleClickOutside = () => {
      setShowAutocomplete(false);
    };

    if (showAutocomplete) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showAutocomplete]);

  // Sync scroll between textarea and backdrop
  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredVariables.length === 0) return;
        setActiveIndex((prev) => (prev + 1) % filteredVariables.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredVariables.length === 0) return;
        setActiveIndex((prev) => (prev - 1 + filteredVariables.length) % filteredVariables.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredVariables.length > 0 && filteredVariables[activeIndex]) {
          insertVariable(filteredVariables[activeIndex].name);
        }
      }
      return;
    }

    if (e.key === '{') {
      // Trigger autocomplete
      const textarea = textareaRef.current;
      if (!textarea) return;

      setTimeout(() => {
        updateAutocompleteState(textarea);
      }, 0);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Check if we are currently editing a variable
    const textarea = e.target;
    const cursor = textarea.selectionStart;

    // Find the last '{' before cursor
    const textBeforeCursor = newValue.substring(0, cursor);
    const lastOpenBrace = textBeforeCursor.lastIndexOf('{');

    if (lastOpenBrace !== -1) {
      // Check if there's a closing brace before the cursor (meaning we are not inside a variable)
      const textBetween = textBeforeCursor.substring(lastOpenBrace + 1);
      if (!textBetween.includes('}')) {
        // We are potentially typing a variable
        setFilterText(textBetween);
        setActiveIndex(0);
        if (!showAutocomplete) {
          updateAutocompleteState(textarea);
        }
        return;
      }
    }

    if (showAutocomplete) {
      setShowAutocomplete(false);
    }
  };

  const updateAutocompleteState = (textarea: HTMLTextAreaElement) => {
    const { selectionStart } = textarea;
    const textBeforeCursor = textarea.value.substring(0, selectionStart);
    const lines = textBeforeCursor.split('\n');
    const currentLineIndex = lines.length - 1;
    const currentLineText = lines[currentLineIndex] || '';

    const lineHeight = 20; // Assumed line height
    const charWidth = 8; // Assumed char width for monospace

    const top = (currentLineIndex + 1) * lineHeight + 10;
    const left = Math.min(currentLineText.length * charWidth + 20, textarea.clientWidth - 200);

    setAutocompletePosition({ top, left });
    setCursorPosition(selectionStart);
    setFilterText('');
    setActiveIndex(0);
    setShowAutocomplete(true);
  };

  const insertVariable = (variableName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Capture scroll position before update
    const scrollTop = textarea.scrollTop;

    const startPos = cursorPosition - 1; // Position of '{'
    if (startPos < 0) return;

    const endPos = startPos + 1 + filterText.length; // Position after '{' + filterText

    const before = value.substring(0, startPos);
    const after = value.substring(endPos);

    const variableText = `{${variableName}}`;
    const newValue = before + variableText + after;

    onChange(newValue);
    setShowAutocomplete(false);
    setFilterText('');

    const newCursorPos = startPos + variableText.length;

    // Use setTimeout to allow React to process the state change
    setTimeout(() => {
      if (textarea) {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        // Restore scroll position
        textarea.scrollTop = scrollTop;
      }
    }, 0);
  };

  // Generate highlighted content
  const renderHighlights = () => {
    const parts = [];
    let lastIndex = 0;
    const regex = /\{([a-zA-Z0-9_]+)\}/g;
    let match: RegExpExecArray | null;

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
    while ((match = regex.exec(value)) !== null) {
      const varName = match[1];
      const isValid = variables.some((v) => v.name === varName) || varName === 'template_prompt';
      const index = match.index;

      // Add text before match
      if (index > lastIndex) {
        parts.push(
          <span
            key={`text-${lastIndex}`}
            className="text-foreground"
          >
            {value.substring(lastIndex, index)}
          </span>,
        );
      }

      // Add match with highlighting if invalid
      if (!isValid) {
        parts.push(
          <span
            key={index}
            className="bg-destructive/20 text-destructive rounded-sm px-0.5 -mx-0.5 border border-destructive/30"
          >
            {match[0]}
          </span>,
        );
      } else {
        parts.push(
          <span
            key={index}
            className="text-primary font-medium bg-primary/10 rounded-sm px-0.5 -mx-0.5"
          >
            {match[0]}
          </span>,
        );
      }

      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < value.length) {
      parts.push(
        <span
          key={`text-${lastIndex}`}
          className="text-foreground"
        >
          {value.substring(lastIndex)}
        </span>,
      );
    }

    // Add a trailing space to ensure last line rendering matches textarea
    if (value.endsWith('\n')) {
      parts.push(<br key="last-br" />);
    }

    return parts;
  };

  return (
    <div className="space-y-2">
      <div className="relative group">
        {/* Container for Backdrop and Textarea */}
        <div className="relative min-h-[80px] w-full">
          {/* Backdrop for highlighting */}
          <div
            ref={backdropRef}
            inert={true}
            className={cn(
              'absolute inset-0 w-full h-full overflow-hidden whitespace-pre-wrap break-words',
              'px-3 py-3 text-base md:text-sm font-mono pointer-events-none',
              'bg-transparent', // Removed text-transparent from container
              className,
            )}
            aria-hidden="true"
          >
            {renderHighlights()}
          </div>

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            placeholder={placeholder}
            className={cn(
              'relative z-10 bg-transparent hover:bg-transparent focus-visible:bg-transparent text-transparent caret-foreground font-mono resize-y',
              'focus-visible:ring-1 focus-visible:ring-ring focus-visible:translate-y-0 focus-visible:shadow-none',
              className,
            )}
            spellCheck={false}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />

          {/* Expand button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            onClick={() => setIsExpandDialogOpen(true)}
            title="Expand editor"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {showAutocomplete && (
          <div
            className="absolute z-50"
            style={{
              top: `${autocompletePosition.top}px`,
              left: `${autocompletePosition.left}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border rounded-md bg-popover shadow-md w-[250px] max-h-[300px] overflow-y-auto flex flex-col">
              <div className="p-2 text-xs font-semibold text-muted-foreground border-b bg-muted/50">
                Variables {filterText && <span className="font-normal opacity-70">(filtering: "{filterText}")</span>}
              </div>
              <div className="p-1 flex-1">
                {filteredVariables.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground text-center">No matching variables</div>
                ) : (
                  filteredVariables.map((variable, index) => (
                    <button
                      key={variable.id || variable.name}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        insertVariable(variable.name);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded transition-colors cursor-pointer flex flex-col gap-1',
                        index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                      )}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <span className="font-mono text-xs font-medium">{`{${variable.name}}`}</span>
                      <span className="text-[10px] text-muted-foreground line-clamp-1">{variable.label}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Helper text and variable list */}
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <div className="flex-1">
          <p className="flex items-center gap-1.5">
            <span>
              Type <kbd className="px-1 py-0.5 text-xs border rounded bg-muted font-mono">{'{'}</kbd> to insert variables
            </span>
          </p>
        </div>
        {enabledVariables.length > 0 && (
          <button
            type="button"
            onClick={() => setShowVariableList(!showVariableList)}
            className="text-xs underline hover:text-foreground transition-colors"
          >
            {showVariableList ? 'Hide' : 'Show'} variables ({enabledVariables.length})
          </button>
        )}
      </div>

      {/* Variable list panel */}
      {showVariableList && enabledVariables.length > 0 && (
        <div className="border rounded-md bg-muted/30 p-3">
          <div className="text-xs font-semibold mb-2 text-muted-foreground">Available Variables</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {enabledVariables.map((variable) => (
              <button
                key={variable.id || variable.name}
                onClick={() => insertVariable(variable.name)}
                className="text-left px-2 py-1.5 rounded bg-background border hover:bg-accent hover:border-accent-foreground/20 transition-colors cursor-pointer group"
                type="button"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs text-foreground group-hover:text-accent-foreground">{`{${variable.name}}`}</span>
                  <span className="text-[10px] text-muted-foreground">{variable.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Expand dialog for fullscreen editing */}
      <PromptExpandDialog
        open={isExpandDialogOpen}
        onOpenChange={setIsExpandDialogOpen}
        title={expandDialogTitle}
        value={value}
        onSave={onChange}
        showCharCount
      />
    </div>
  );
}
