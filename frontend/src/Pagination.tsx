interface PaginationProps {
  page: number
  next: string | null
  previous: string | null
  onPage: (page: number) => void
}

export function Pagination({ page, next, previous, onPage }: PaginationProps) {
  if (!next && !previous) return null
  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="button" disabled={!previous} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="muted">Page {page}</span>
      <button className="button" disabled={!next} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  )
}
