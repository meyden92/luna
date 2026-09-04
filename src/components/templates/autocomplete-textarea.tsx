import { Maximize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PromptExpandDialog } from '@/components/ai/editor/PromptExpandDialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/libs/utils';
import type { TemplateVariable } from '@/types/template';
import styles from './autocomplete-textarea.module.css';

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
            className={styles.plain}
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
            className={styles.tokenInvalid}
          >
            {match[0]}
          </span>,
        );
      } else {
        parts.push(
          <span
            key={index}
            className={styles.tokenValid}
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
          className={styles.plain}
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
    <div className="stack space-2">
      <div className={styles.editor}>
        {/* Container for Backdrop and Textarea */}
        <div className={styles.field}>
          {/* Backdrop for highlighting */}
          <div
            ref={backdropRef}
            inert={true}
            className={cn(styles.backdrop, className)}
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
            className={cn(styles.input, className)}
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
            className={styles.expand}
            onClick={() => setIsExpandDialogOpen(true)}
            title="Expand editor"
          >
            <Maximize2 />
          </Button>
        </div>

        {showAutocomplete && (
          <div
            className={styles.popupAnchor}
            style={{
              top: `${autocompletePosition.top}px`,
              left: `${autocompletePosition.left}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.popup}>
              <div className={cn('type-xs weight-semibold', styles.popupHeader)}>
                Variables {filterText && <span className={styles.filterHint}>(filtering: "{filterText}")</span>}
              </div>
              <div className={styles.popupList}>
                {filteredVariables.length === 0 ? (
                  <div className={cn('type-xs', styles.popupEmpty)}>No matching variables</div>
                ) : (
                  filteredVariables.map((variable, index) => (
                    <button
                      key={variable.id || variable.name}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        insertVariable(variable.name);
                      }}
                      className={styles.option}
                      data-active={index === activeIndex ? '' : undefined}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <span className="type-mono type-xs weight-medium">{`{${variable.name}}`}</span>
                      <span className={cn('type-xs type-truncate', styles.optionLabel)}>{variable.label}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Helper text and variable list */}
      <div className={cn('type-sm', styles.helper)}>
        <div className={styles.helperText}>
          <p className={styles.helperLine}>
            <span>
              Type <kbd className={cn('type-xs', styles.kbd)}>{'{'}</kbd> to insert variables
            </span>
          </p>
        </div>
        {enabledVariables.length > 0 && (
          <button
            type="button"
            onClick={() => setShowVariableList(!showVariableList)}
            className={cn('type-xs', styles.toggle)}
          >
            {showVariableList ? 'Hide' : 'Show'} variables ({enabledVariables.length})
          </button>
        )}
      </div>

      {/* Variable list panel */}
      {showVariableList && enabledVariables.length > 0 && (
        <div className={styles.panel}>
          <div className={cn('type-xs weight-semibold', styles.panelTitle)}>Available Variables</div>
          <div className={styles.panelGrid}>
            {enabledVariables.map((variable) => (
              <button
                key={variable.id || variable.name}
                onClick={() => insertVariable(variable.name)}
                className={styles.chip}
                type="button"
              >
                <div className={styles.chipBody}>
                  <span className={cn('type-xs', styles.chipName)}>{`{${variable.name}}`}</span>
                  <span className={cn('type-xs', styles.chipLabel)}>{variable.label}</span>
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
