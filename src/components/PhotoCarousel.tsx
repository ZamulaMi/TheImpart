import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
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
  onOpenLightbox?: (
    src: string,
    caption?: string,
    slides?: CarouselSlide[],
    index?: number,
    onSyncIndex?: (idx: number) => void
  ) => void;
  className?: string;
  isEditor?: boolean;
}

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
  axis: 'x' | 'y' | null;
}

export const PhotoCarousel: React.FC<PhotoCarouselProps> = ({
  images = [],
  caption,
  onOpenLightbox,
  className = '',
  isEditor = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbsContainerRef = useRef<HTMLDivElement>(null);

  const isFirstTrackSyncRef = useRef<boolean>(true);
  const isFirstThumbSyncRef = useRef<boolean>(true);
  const didDragRef = useRef<boolean>(false);

  const dragStateRef = useRef<DragState>({
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
    axis: null,
  });

  const total = images.length;
  const currentSlide = images[currentIndex] || images[0];

  // Нормалізація індексу у випадку видалення слайдів
  useEffect(() => {
    if (currentIndex >= total && total > 0) {
      setCurrentIndex(total - 1);
    }
  }, [total, currentIndex]);

  // Попереднє завантаження та декодування сусідніх фото, щоб гортання відбувалося без затримок
  useEffect(() => {
    if (total <= 1) return;
    const neighborIndices = [
      (currentIndex + 1) % total,
      (currentIndex - 1 + total) % total,
    ];
    neighborIndices.forEach((idx) => {
      const url = images[idx]?.url;
      if (url) {
        const preloader = new Image();
        preloader.decoding = 'async';
        preloader.src = url;
      }
    });
  }, [currentIndex, images, total]);

  // Плавна GPU-анімація треку при зміні індексу
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    if (isFirstTrackSyncRef.current) {
      isFirstTrackSyncRef.current = false;
      track.classList.remove('is-animating');
      track.style.transform = `translate3d(${-currentIndex * 100}%, 0, 0)`;
      return;
    }

    track.classList.add('is-animating');
    track.style.transform = `translate3d(${-currentIndex * 100}%, 0, 0)`;
  }, [currentIndex]);

  // Плавне горизонтальне центрування активної мініатюри без вертикального прокручування сторінки
  useEffect(() => {
    const container = thumbsContainerRef.current;
    if (!container || total < 3) return;
    const activeBtn = container.children[currentIndex] as HTMLElement | undefined;
    if (!activeBtn) return;

    const targetLeft =
      activeBtn.offsetLeft - container.clientWidth / 2 + activeBtn.offsetWidth / 2;

    container.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: isFirstThumbSyncRef.current ? 'auto' : 'smooth',
    });
    isFirstThumbSyncRef.current = false;
  }, [currentIndex, total]);

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

  const goToSlide = useCallback(
    (idx: number, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (idx >= 0 && idx < total) {
        setCurrentIndex(idx);
      }
    },
    [total]
  );

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

  // Реалтайм 1:1 свайп пальцем або перетягування мишею
  const startDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (total <= 1) return;
      didDragRef.current = false;
      dragStateRef.current = {
        active: true,
        startX: clientX,
        startY: clientY,
        lastX: clientX,
        lastTime: performance.now(),
        velocityX: 0,
        axis: null,
      };
    },
    [total]
  );

  const moveDrag = useCallback(
    (clientX: number, clientY: number) => {
      const st = dragStateRef.current;
      if (!st.active) return;

      const dx = clientX - st.startX;
      const dy = clientY - st.startY;

      if (st.axis === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          st.axis = 'y';
          st.active = false;
          return;
        }
        st.axis = 'x';
        didDragRef.current = true;
        trackRef.current?.classList.remove('is-animating');
      }

      if (st.axis === 'x') {
        const now = performance.now();
        const dt = Math.max(1, now - st.lastTime);
        const instantVx = (clientX - st.lastX) / dt;
        st.velocityX = st.velocityX * 0.4 + instantVx * 0.6;
        st.lastX = clientX;
        st.lastTime = now;

        const isPastStart = currentIndex === 0 && dx > 0;
        const isPastEnd = currentIndex === total - 1 && dx < 0;
        const dampedDx = isPastStart || isPastEnd ? dx * 0.28 : dx;

        if (trackRef.current) {
          trackRef.current.style.transform = `translate3d(calc(${-currentIndex * 100}% + ${dampedDx}px), 0, 0)`;
        }
      }
    },
    [currentIndex, total]
  );

  const endDrag = useCallback(() => {
    const st = dragStateRef.current;
    if (!st.active) return;
    st.active = false;

    if (st.axis !== 'x') return;

    const totalDx = st.lastX - st.startX;
    const width = viewportRef.current?.clientWidth || 320;
    const distanceThreshold = Math.min(90, Math.max(36, width * 0.14));
    const isFastFlick = Math.abs(st.velocityX) > 0.35 && Math.abs(totalDx) > 16;

    let nextIdx = currentIndex;
    if (
      (totalDx < -distanceThreshold || (isFastFlick && st.velocityX < 0)) &&
      currentIndex < total - 1
    ) {
      nextIdx = currentIndex + 1;
    } else if (
      (totalDx > distanceThreshold || (isFastFlick && st.velocityX > 0)) &&
      currentIndex > 0
    ) {
      nextIdx = currentIndex - 1;
    }

    const track = trackRef.current;
    if (track) {
      void track.offsetWidth;
      track.classList.add('is-animating');
      track.style.transform = `translate3d(${-nextIdx * 100}%, 0, 0)`;
    }

    if (nextIdx !== currentIndex) {
      setCurrentIndex(nextIdx);
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        didDragRef.current = false;
      }, 0);
    });
  }, [currentIndex, total]);

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current.active) return;
      moveDrag(e.clientX, e.clientY);
    };
    const handleWindowMouseUp = () => {
      if (!dragStateRef.current.active) return;
      endDrag();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [moveDrag, endDrag]);

  const handleOpenFullscreen = useCallback(
    (slideIndex: number) => {
      if (!onOpenLightbox || isEditor) return;
      const targetSlide = images[slideIndex] || currentSlide;
      if (!targetSlide) return;
      onOpenLightbox(
        targetSlide.url,
        targetSlide.caption,
        images,
        slideIndex,
        (syncedIdx: number) => {
          if (syncedIdx >= 0 && syncedIdx < images.length) {
            setCurrentIndex(syncedIdx);
          }
        }
      );
    },
    [currentSlide, images, isEditor, onOpenLightbox]
  );

  if (!images || images.length === 0) {
    return null;
  }

  const activeCaption = currentSlide?.caption?.trim() || '';
  const overallCaption = caption?.trim() || '';
  const hasAnyCaption =
    Boolean(overallCaption) || images.some((slide) => Boolean(slide?.caption?.trim()));

  return (
    <figure
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`article-carousel-wrapper my-8 sm:my-10 select-none outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600 rounded-xl transition-all ${className}`}
      aria-label="Карусель фотографій"
      role="region"
    >
      {/* Головний контейнер слайдера */}
      <div
        ref={viewportRef}
        onTouchStart={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchMove={(e) => {
          moveDrag(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchEnd={endDrag}
        onTouchCancel={endDrag}
        onMouseDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
          startDrag(e.clientX, e.clientY);
        }}
        className="article-carousel-viewport carousel-viewport relative w-full aspect-[16/10] sm:aspect-[16/9] max-h-[640px] rounded-xl overflow-hidden bg-neutral-100 dark:bg-[#161616] border border-neutral-200/80 dark:border-[#2e2e2e] shadow-sm group"
      >
        {/* Горизонтальний GPU-трек усіх слайдів */}
        <div ref={trackRef} className="carousel-track flex w-full h-full">
          {images.map((slide, idx) => {
            const isNearby =
              Math.abs(idx - currentIndex) <= 1 ||
              (currentIndex === 0 && idx === total - 1) ||
              (currentIndex === total - 1 && idx === 0);

            return (
              <div
                key={`${slide.url}-${idx}`}
                className="w-full h-full shrink-0 flex items-center justify-center overflow-hidden"
              >
                <img
                  src={slide.url}
                  alt={slide.alt || slide.caption || `Фото ${idx + 1} з ${total}`}
                  loading={isNearby ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                  onClick={() => {
                    if (didDragRef.current) {
                      didDragRef.current = false;
                      return;
                    }
                    handleOpenFullscreen(idx);
                  }}
                  className={`w-full h-full object-cover sm:object-contain select-none ${
                    onOpenLightbox && !isEditor ? 'cursor-zoom-in' : ''
                  }`}
                />
              </div>
            );
          })}
        </div>

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
              handleOpenFullscreen(currentIndex);
            }}
            title="Переглянути фото на весь екран"
            aria-label="Переглянути фото на весь екран"
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
              className="absolute left-2.5 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/45 hover:bg-black/80 active:scale-95 text-white backdrop-blur-md border border-white/10 flex items-center justify-center transition-all duration-200 shadow-lg cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <button
              type="button"
              onClick={goToNext}
              title="Наступне фото (стрілка вправо)"
              aria-label="Наступне фото"
              className="absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/45 hover:bg-black/80 active:scale-95 text-white backdrop-blur-md border border-white/10 flex items-center justify-center transition-all duration-200 shadow-lg cursor-pointer"
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
                  className={`transition-all duration-300 ease-out cursor-pointer rounded-full ${
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
        <div
          ref={thumbsContainerRef}
          className="article-carousel-thumbs flex items-center gap-2 mt-2.5 overflow-x-auto py-1 px-3 sm:px-0.5 no-scrollbar"
        >
          {images.map((img, idx) => {
            const isActive = idx === currentIndex;
            return (
              <button
                key={`${img.url}-thumb-${idx}`}
                type="button"
                onClick={(e) => goToSlide(idx, e)}
                className={`relative flex-shrink-0 w-14 h-10 sm:w-16 sm:h-11 rounded-md overflow-hidden border transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'border-black dark:border-white ring-1 ring-black dark:ring-white opacity-100'
                    : 'border-transparent opacity-50 hover:opacity-85'
                }`}
                title={`Фото ${idx + 1}`}
              >
                <img
                  src={img.url}
                  alt={img.alt || `Мініатюра ${idx + 1}`}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="w-full h-full object-cover select-none"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Підпис до слайда або всієї каруселі (стабільна висота без стрибків тексту нижче) */}
      {hasAnyCaption && (
        <figcaption className="mt-2.5 min-h-[1.25rem] text-center text-xs sm:text-sm text-neutral-500 dark:text-[#888888] font-sans px-2 transition-opacity duration-200">
          {activeCaption ? (
            <span>
              {overallCaption && overallCaption !== activeCaption && (
                <span className="font-medium text-neutral-700 dark:text-[#aaaaaa]">
                  {overallCaption} •{' '}
                </span>
              )}
              <span className="italic">{activeCaption}</span>
            </span>
          ) : overallCaption ? (
            <span className="italic">{overallCaption}</span>
          ) : null}
        </figcaption>
      )}
    </figure>
  );
};
