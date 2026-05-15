import { Fragment } from 'react'

export type MetadataItem = {
  value: string
  dim?: boolean
}

export type MetadataRowProps = {
  items: MetadataItem[]
}

export function MetadataRow({ items }: MetadataRowProps) {
  return (
    <ul className='metadata-row' aria-label='Metadata'>
      {items.map((item, idx) => (
        <Fragment key={`${item.value}-${idx}`}>
          <li
            className='metadata-row-item'
            data-dim={item.dim ? 'true' : 'false'}
          >
            {item.value}
          </li>
          {idx < items.length - 1 ? (
            <li className='metadata-row-sep' aria-hidden='true'>
              ·
            </li>
          ) : null}
        </Fragment>
      ))}
    </ul>
  )
}
