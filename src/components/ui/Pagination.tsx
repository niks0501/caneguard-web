import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  pageCount: number;
  itemCount: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  pageCount,
  itemCount,
  onPageChange,
}: PaginationProps) {
  return (
    <div className="pagination" aria-label="Report table pagination">
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
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
          <button
            type="button"
            aria-label={`Go to page ${page}`}
            aria-current={page === currentPage ? "page" : undefined}
            key={page}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
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
    </div>
  );
}
