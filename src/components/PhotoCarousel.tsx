import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Images,
  Maximize2,
} from 'lucide-react';

export interface CarouselSlide {
  url: string;
  caption?: string;
  alt?: string;
}

interface PhotoCarouselProps {
  images: CarouselSlide[];
  caption?: string;
  onOpenLightbox?: (src: string, caption?: string) => void;
  className?: string;
  isEditor?: boolean;
}

export const PhotoCarousel: React.FC<PhotoCarouselProps> = ({
  images = [],
  caption,
  onOpenLightbox,
  className = '',
  isEditor = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchDeltaX, setTouchDeltaX] = useState<number>(0);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = images.length;
  const currentSlide = images[currentIndex] || images[0];

  // Нормалізація індексу у випадку видалення слайдів
  useEffect(() => {
    if (currentIndex >= total && total > 0) {
      setCurrentIndex(total - 1);
    }
  }, [total, currentIndex]);

  const goToNext = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (total <= 1) return;
      setCurrentIndex((prev) => (prev + 1) % total);
    },
    [total]
  );

  const goToPrev = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (total <= 1) return;
      setCurrentIndex((prev) => (prev - 1 + total) % total);
    },
    [total]
  );

  const goToSlide = (idx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (idx >= 0 && idx < total) {
      setCurrentIndex(idx);
    }
  };

  // Керування стрілками клавіатури, коли елемент у фокусі
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToNext();
    }
  };

  // Сенсорне перемикання свайпом на мобільних пристроях
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchDeltaX(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const currentX = e.touches[0].clientX;
    setTouchDeltaX(currentX - touchStartX);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null) return;
    const threshold = 45; // поріг свайпу в пікселях
    if (touchDeltaX < -threshold) {
      goToNext();
    } else if (touchDeltaX > threshold) {
      goToPrev();
    }
    setTouchStartX(null);
    setTouchDeltaX(0);
  };

  if (!images || images.length === 0) {
    return null;
  }

  const activeCaption = currentSlide?.caption?.trim() || '';
  const overallCaption = caption?.trim() || '';

  return (
    <figure
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`article-carousel-wrapper my-8 sm:my-10 select-none outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600 rounded-xl transition-all ${className}`}
      aria-label="Карусель фотографій"
      role="region"
    >
      {/* Головний контейнер слайдера */}
      <div
        className="relative w-full aspect-[16/10] sm:aspect-[16/9] max-h-[640px] rounded-xl overflow-hidden bg-neutral-100 dark:bg-[#161616] border border-neutral-200/80 dark:border-[#2e2e2e] shadow-sm flex items-center justify-center group"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Зображення поточного слайду */}
        {currentSlide && (
          <img
            key={currentSlide.url}
            src={currentSlide.url}
            alt={currentSlide.alt || currentSlide.caption || `Фото ${currentIndex + 1} з ${total}`}
            loading="lazy"
            decoding="async"
            onClick={() => {
              if (onOpenLightbox && !isEditor) {
                onOpenLightbox(currentSlide.url, currentSlide.caption);
              }
            }}
            className={`w-full h-full object-cover sm:object-contain transition-opacity duration-300 ${
              onOpenLightbox && !isEditor ? 'cursor-zoom-in' : ''
            }`}
          />
        )}

        {/* Лічильник фото (Індикатор кількості) у правому верхньому кутку */}
        {total > 1 && (
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/60 dark:bg-black/75 text-white backdrop-blur-md text-[11px] sm:text-xs font-mono tracking-wider shadow-sm pointer-events-none">
            <Images className="w-3.5 h-3.5 opacity-80" />
            <span>
              {currentIndex + 1} / {total}
            </span>
          </div>
        )}

        {/* Кнопка збільшення для перегляду на весь екран */}
        {onOpenLightbox && !isEditor && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLightbox(currentSlide.url, currentSlide.caption);
            }}
            title="Переглянути фото на весь екран"
            className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10 p-2 rounded-md bg-black/50 hover:bg-black/75 text-white/90 hover:text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Стрілки перемикання (Ліворуч / Праворуч) */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={goToPrev}
              title="Попереднє фото (стрілка вліво)"
              aria-label="Попереднє фото"
              className="absolute left-2.5 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/45 hover:bg-black/80 active:scale-95 text-white backdrop-blur-md border border-white/10 flex items-center justify-center transition-all shadow-lg cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <button
              type="button"
              onClick={goToNext}
              title="Наступне фото (стрілка вправо)"
              aria-label="Наступне фото"
              className="absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/45 hover:bg-black/80 active:scale-95 text-white backdrop-blur-md border border-white/10 flex items-center justify-center transition-all shadow-lg cursor-pointer"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </>
        )}

        {/* Індикатори точок / смужок (Dots) у нижній частині фото */}
        {total > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md">
            {images.map((_, idx) => {
              const isActive = idx === currentIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => goToSlide(idx, e)}
                  title={`Перейти до фото ${idx + 1}`}
                  aria-label={`Перейти до фото ${idx + 1}`}
                  className={`transition-all duration-300 cursor-pointer rounded-full ${
                    isActive
                      ? 'w-5 sm:w-6 h-1.5 bg-white shadow-xs'
                      : 'w-1.5 h-1.5 bg-white/45 hover:bg-white/80'
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Нижня стрічка мініатюр (для швидкого огляду всіх фото, якщо їх >= 3) */}
      {total >= 3 && (
        <div className="flex items-center gap-2 mt-2.5 overflow-x-auto py-1 px-0.5 no-scrollbar">
          {images.map((img, idx) => {
            const isActive = idx === currentIndex;
            return (
              <button
                key={idx}
                type="button"
                onClick={(e) => goToSlide(idx, e)}
                className={`relative flex-shrink-0 w-14 h-10 sm:w-16 sm:h-11 rounded-md overflow-hidden border transition-all cursor-pointer ${
                  isActive
                    ? 'border-black dark:border-white ring-1 ring-black dark:ring-white opacity-100'
                    : 'border-transparent opacity-50 hover:opacity-85'
                }`}
                title={`Фото ${idx + 1}`}
              >
                <img
                  src={img.url}
                  alt={img.alt || `Мініатюра ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Підпис до слайда або всієї каруселі */}
      {(activeCaption || overallCaption) && (
        <figcaption className="mt-2.5 text-center text-xs sm:text-sm text-neutral-500 dark:text-[#888888] font-sans px-2">
          {activeCaption ? (
            <span>
              {overallCaption && <span className="font-medium text-neutral-700 dark:text-[#aaaaaa]">{overallCaption} • </span>}
              <span className="italic">{activeCaption}</span>
            </span>
          ) : (
            <span className="italic">{overallCaption}</span>
          )}
        </figcaption>
      )}
    </figure>
  );
};
