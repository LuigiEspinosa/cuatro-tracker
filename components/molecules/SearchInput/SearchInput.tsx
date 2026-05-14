'use client'

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

export type SearchInputProps = {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  debounceMs?: number
  reducedMotionOverride?: boolean
}

export type SearchInputHandle = {
  focus: () => void
}

export const SearchInput = forwardRef<SearchInputHandle, SearchInputProps>(
  function SearchInput(
    {
      value,
      onChange,
      placeholder = 'Title, year, keyword…',
      debounceMs = 175,
      reducedMotionOverride,
    },
    ref,
  ) {
    const reactId = useId()
    const inputId = `si-${reactId}`
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [draft, setDraft] = useState(value)
    const [focused, setFocused] = useState(false)
    const [debouncing, setDebouncing] = useState(false)

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }))

    // Sync draft when parent forces a value change (e.g. ESC clears externally).
    useEffect(() => {
      setDraft(value)
    }, [value])

    // Pin onChange in a ref so debounce timer is not re-scheduled when callers
    // pass a non-stable function identity. Defends against parent re-render
    // churn restarting the timer and effectively disabling the debounce.
    const onChangeRef = useRef(onChange)
    useEffect(() => {
      onChangeRef.current = onChange
    })

    // Debounced flush. Clears the debouncing flag when the timer fires or the
    // draft already matches the parent value (no work to do).
    useEffect(() => {
      if (draft === value) {
        setDebouncing(false)
        return
      }
      setDebouncing(true)
      const timer = setTimeout(() => {
        setDebouncing(false)
        onChangeRef.current(draft)
      }, debounceMs)
      return () => clearTimeout(timer)
    }, [draft, value, debounceMs])

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setDraft('')
        setDebouncing(false)
        onChange('')
      }
    }

    const rmValue =
      reducedMotionOverride === undefined ? undefined : String(reducedMotionOverride)

    return (
      <div className='si'>
        <label htmlFor={inputId} className='si-label'>
          <span>SEARCH</span>
          <span className='si-hint'>
            {debouncing ? 'DEBOUNCING…' : 'PRESS ESC TO CLEAR'}
          </span>
        </label>
        <div
          className='si-wrap'
          data-focused={focused ? 'true' : 'false'}
          data-rm={rmValue}
        >
          <span className='si-caret' aria-hidden='true'>
            &gt;
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type='search'
            className='si-field'
            value={draft}
            placeholder={placeholder}
            autoComplete='off'
            spellCheck={false}
            aria-label='Search'
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
          />
          <span className='si-cursor' aria-hidden='true' />
        </div>
      </div>
    )
  },
)
