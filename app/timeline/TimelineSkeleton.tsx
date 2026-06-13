/* Skeleton rows for the timeline loading state. Server component (no hooks):
 * used by both loading.tsx (route-level fetch) and the page's Suspense fallback
 * (the useSearchParams boundary). The shimmer is disabled under reduced motion
 * via the CSS media query, so no client hook is needed here.
 */
export function TimelineSkeleton() {
  return (
    <ul className='tl-body tl-body-skeleton' aria-hidden='true'>
      {Array.from({ length: 8 }).map((_, index) => (
        <li key={index} className='tl-skel-row'>
          <span className='tl-skel-box tl-skel-thumb' />
          <span className='tl-skel-lines'>
            <span className='tl-skel-box tl-skel-title' />
            <span className='tl-skel-box tl-skel-meta' />
          </span>
          <span className='tl-skel-box tl-skel-led' />
          <span className='tl-skel-box tl-skel-date' />
        </li>
      ))}
    </ul>
  )
}
