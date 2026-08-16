import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { GEOCODING_DEBOUNCE_MS } from '@/config/constants'
import type { LatLng } from '@/lib/geo/coordinates'
import { searchAddress, type GeocodingResult } from '.'
import './geocoding.css'

/**
 * Address autocomplete (spec 14): 300 ms debounce, at most 5 suggestions,
 * results cached locally. Implements the ARIA combobox pattern so the list is
 * fully keyboard operable (spec 36).
 */

export interface PlaceSearchInputProps {
  id?: string
  label: string
  placeholder?: string
  value: string
  onValueChange: (value: string) => void
  onSelect: (place: { label: string } & LatLng) => void
  onClear?: () => void
  proximity?: LatLng | null
  leadingAction?: React.ReactNode
}

export function PlaceSearchInput({
  id,
  label,
  placeholder,
  value,
  onValueChange,
  onSelect,
  onClear,
  proximity,
  leadingAction,
}: PlaceSearchInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listboxId = `${inputId}-listbox`

  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const justSelected = useRef(false)

  const proximityKey = useMemo(
    () => (proximity ? `${proximity.latitude.toFixed(2)},${proximity.longitude.toFixed(2)}` : ''),
    [proximity],
  )

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false
      return
    }
    const query = value.trim()
    if (query.length < 3) {
      setSuggestions([])
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(() => {
      setStatus('loading')
      searchAddress(query, {
        proximity: proximity ?? undefined,
        signal: controller.signal,
      })
        .then((results) => {
          setSuggestions(results)
          setActiveIndex(-1)
          setOpen(results.length > 0)
          setStatus('idle')
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([])
            setStatus('error')
          }
        })
    }, GEOCODING_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // `proximityKey` stands in for the object identity of `proximity`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, proximityKey])

  const choose = (result: GeocodingResult) => {
    justSelected.current = true
    onValueChange(result.context ? `${result.label}, ${result.context}` : result.label)
    onSelect({
      label: result.label,
      latitude: result.latitude,
      longitude: result.longitude,
    })
    setOpen(false)
    setSuggestions([])
    setActiveIndex(-1)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (event.key === 'ArrowDown' && suggestions.length > 0) setOpen(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1))
    } else if (event.key === 'Enter') {
      const active = suggestions[activeIndex]
      if (active) {
        event.preventDefault()
        choose(active)
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="place-search">
      <label className="visually-hidden" htmlFor={inputId}>
        {label}
      </label>
      <div className="place-search__control">
        {leadingAction}
        <input
          id={inputId}
          className="place-search__input"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          placeholder={placeholder ?? label}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value)
            if (event.target.value.trim().length === 0) onClear?.()
          }}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        />
        {value.length > 0 ? (
          <button
            type="button"
            className="place-search__clear"
            aria-label={`Effacer ${label.toLowerCase()}`}
            onClick={() => {
              onValueChange('')
              onClear?.()
              setSuggestions([])
              setOpen(false)
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {status === 'error' ? (
        <p className="place-search__status" role="status">
          Recherche d’adresse indisponible pour le moment.
        </p>
      ) : null}

      {open && suggestions.length > 0 ? (
        <ul className="place-search__listbox" id={listboxId} role="listbox" aria-label={label}>
          {suggestions.map((result, index) => (
            <li
              key={result.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className="place-search__option"
              data-active={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(result)
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="place-search__option-label">{result.label}</span>
              {result.context ? (
                <span className="place-search__option-context">{result.context}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
