'use client'

import { forwardRef, useId, useState } from 'react'

export type TerminalInputProps = {
  id?: string
  name: string
  type?: 'text' | 'email' | 'password'
  label: string
  defaultValue?: string
  autoComplete?: string
  required?: boolean
  reducedMotionOverride?: boolean
}

export const TerminalInput = forwardRef<HTMLInputElement, TerminalInputProps>(
  function TerminalInput(
    {
      id,
      name,
      type = 'text',
      label,
      defaultValue,
      autoComplete,
      required,
      reducedMotionOverride,
    },
    ref,
  ) {
    const reactId = useId()
    const inputId = id ?? `ti-${reactId}`
    const [focused, setFocused] = useState(false)
    const rmValue =
      reducedMotionOverride === undefined ? undefined : String(reducedMotionOverride)

    return (
      <div className='ti'>
        <label htmlFor={inputId} className='ti-label'>
          {label}
        </label>
        <div
          className='ti-wrap'
          data-focused={focused ? 'true' : 'false'}
          data-rm={rmValue}
          data-testid='ti-wrap'
        >
          <input
            ref={ref}
            id={inputId}
            name={name}
            type={type}
            defaultValue={defaultValue}
            autoComplete={autoComplete}
            required={required}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className='ti-field'
          />
          <span className='ti-cursor' aria-hidden='true' data-testid='ti-cursor' />
        </div>
      </div>
    )
  },
)
