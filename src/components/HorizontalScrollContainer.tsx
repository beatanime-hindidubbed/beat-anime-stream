import { useRef, useState, useEffect, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  children: ReactNode;
  className?: string;
  /** Scroll distance in pixels when clicking an arrow (default 300) */
  scrollAmount?: number;
}

export default function HorizontalScrollContainer({
  children,
  className = '',
  scrollAmount = 300,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // Update arrow visibility based on scroll position
  const updateArrows = () => {
    const el = containerRef.current;
    if (!el) return;
    setShowLeftArrow(el.scrollLeft > 0);
    setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 2); // 2px tolerance
  };

  // Attach scroll and resize observers
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateArrows(); // initial check

    const onScroll = () => updateArrows();
    el.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateArrows());
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, [children]); // re-run when children change (e.g., episodes update)

  const scroll = (direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el) return;
    const delta = direction === 'left' ? -scrollAmount : scrollAmount;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div className="relative group/scroll">
      {/* Left arrow */}
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/70 backdrop-blur-sm text-white flex items-center justify-center hover:bg-primary transition-colors shadow-lg opacity-0 group-hover/scroll:opacity-100 focus:opacity-100 transition-opacity"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      )}

      {/* Scrollable container */}
      <div
        ref={containerRef}
        className={`overflow-x-auto scrollbar-hide snap-x ${className}`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>

      {/* Right arrow */}
      {showRightArrow && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/70 backdrop-blur-sm text-white flex items-center justify-center hover:bg-primary transition-colors shadow-lg opacity-0 group-hover/scroll:opacity-100 focus:opacity-100 transition-opacity"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      )}
    </div>
  );
}
