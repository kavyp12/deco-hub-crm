/**
 * SearchableSelect.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for every <select> / <Select> in the Selection forms.
 *
 * Features
 *  • Instant live search (no debounce delay)
 *  • Keyboard navigation  ↑ ↓ Enter Escape
 *  • Backspace to clear when closed
 *  • Single compact selected-value chip (truncated with ellipsis)
 *  • Smooth open/close animation
 *  • Works with plain <option>-style options array
 *  • Disabled state
 *  • Optional colorVariant  ("default" | "green" | "blue")
 *  • Optional allowCreate prop to let users input custom text
 *
 * Usage
 *  <SearchableSelect
 *    options={[{ value: 'a', label: 'Alpha' }, ...]}
 *    value={selectedValue}
 *    onChange={(val) => setSelectedValue(val)}
 *    placeholder="Search or select…"
 *    disabled={false}
 *    colorVariant="default"   // "green" | "blue"
 *    allowCreate={true}
 *  />
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
} from 'react';

export interface SelectOption {
  value: string;
  label: string;
  isCreateOption?: boolean;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  colorVariant?: 'default' | 'green' | 'blue';
  className?: string;
  id?: string;
  allowCreate?: boolean;
}

const variantStyles = {
  default: {
    trigger:
      'border-input bg-background text-foreground hover:border-primary/50 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
    chip: 'bg-primary/10 text-primary border-primary/20',
    highlight: 'bg-primary/10 text-primary',
  },
  green: {
    trigger:
      'border-green-300 bg-green-50 text-green-900 hover:border-green-400 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-200',
    chip: 'bg-green-100 text-green-800 border-green-300',
    highlight: 'bg-green-100 text-green-800',
  },
  blue: {
    trigger:
      'border-blue-300 bg-blue-50 text-blue-800 hover:border-blue-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200',
    chip: 'bg-blue-100 text-blue-800 border-blue-300',
    highlight: 'bg-blue-100 text-blue-800',
  },
};

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Search or select…',
  disabled = false,
  colorVariant = 'default',
  className = '',
  id,
  allowCreate = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const styles = variantStyles[colorVariant];

  const selectedOption = options.find((o) => o.value === value) || (allowCreate && value ? { value, label: value } : undefined);

  let filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  if (allowCreate && query.trim()) {
    const exactMatch = options.some(o => o.label.toLowerCase() === query.trim().toLowerCase());
    if (!exactMatch) {
      filtered = [
        ...filtered,
        { value: query.trim(), label: `Create "${query.trim()}"`, isCreateOption: true }
      ];
    }
  }

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen) return;
    const li = listRef.current?.children[highlightIdx] as HTMLElement;
    li?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, isOpen]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setQuery('');
    setHighlightIdx(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const select = useCallback(
    (val: string) => {
      onChange(val);
      close();
    },
    [onChange, close]
  );

  const clear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      close();
    },
    [onChange, close]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIdx]) select(filtered[highlightIdx].value);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Backspace':
        if (!query && value) {
          e.preventDefault();
          onChange('');
        }
        break;
    }
  };

  // Trigger keydown when closed (backspace to clear)
  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isOpen) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onChange('');
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onKeyDown={handleTriggerKeyDown}
      tabIndex={disabled ? -1 : 0}
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      id={id}
    >
      {/* ── Trigger ── */}
      <div
        onClick={open}
        className={`
          flex items-center gap-1.5 w-full min-h-[40px] px-3 py-1.5
          border rounded-md cursor-pointer transition-all duration-150 select-none
          ${styles.trigger}
          ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
        `}
      >
        {/* Selected chip or placeholder */}
        <div className="flex-1 flex items-center min-w-0 gap-1.5 overflow-hidden">
          {selectedOption ? (
            <span
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium
                border truncate max-w-full shrink-0
                ${styles.chip}
              `}
              style={{ maxWidth: 'calc(100% - 28px)' }}
            >
              <span className="truncate">{selectedOption.label}</span>
              {/* Inline clear × */}
              <button
                type="button"
                onClick={clear}
                className="ml-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity leading-none"
                tabIndex={-1}
                aria-label="Clear"
              >
                ×
              </button>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground truncate">{placeholder}</span>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`shrink-0 h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* ── Dropdown ── */}
      {isOpen && (
        <div
          className="
            absolute z-50 mt-1 w-full min-w-[220px]
            bg-popover border border-border rounded-lg shadow-xl
            overflow-hidden
            animate-in fade-in slide-in-from-top-1 duration-100
          "
          style={{ maxHeight: '280px' }}
        >
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/60">
              <svg className="h-3.5 w-3.5 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type to search…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                aria-autocomplete="list"
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <ul
            ref={listRef}
            role="listbox"
            className="overflow-y-auto"
            style={{ maxHeight: '220px' }}
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">No results found</li>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightIdx;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => select(opt.value)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={`
                      flex items-center justify-between px-3 py-2 text-sm cursor-pointer
                      transition-colors duration-75
                      ${isHighlighted ? styles.highlight : 'hover:bg-muted/50'}
                      ${isSelected ? 'font-medium' : ''}
                      ${opt.isCreateOption ? 'italic text-primary' : ''}
                    `}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <svg className="h-3.5 w-3.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;