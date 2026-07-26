import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  pageCount: number;
  itemCount: number;
  onPageChange: (page: number) => void;
}

function visiblePages(currentPage: number, pageCount: number) {
  const pages = new Set([
    1,
    pageCount,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);

  return [...pages]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((first, second) => first - second);
}

export function Pagination({
  currentPage,
  pageCount,
  itemCount,
  onPageChange,
}: PaginationProps) {
  return (
    <nav className="pagination" aria-label="Report table pagination">
      <p>
        Page <strong>{currentPage}</strong> of <strong>{pageCount}</strong>
        <span> · {itemCount} reports</span>
      </p>
      <div>
        <button
          type="button"
          aria-label="Previous page"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        {visiblePages(currentPage, pageCount).map((page, index, pages) => (
          <span className="pagination__page" key={page}>
            {index > 0 && page - pages[index - 1] > 1 ? (
              <span className="pagination__ellipsis" aria-hidden="true">…</span>
            ) : null}
            <button
              type="button"
              aria-label={`Go to page ${page}`}
              aria-current={page === currentPage ? "page" : undefined}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          </span>
        ))}
        <button
          type="button"
          aria-label="Next page"
          disabled={currentPage === pageCount}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>
    </nav>
  );
}
