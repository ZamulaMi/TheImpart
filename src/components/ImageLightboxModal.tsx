import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Images } from 'lucide-react';
import { CarouselSlide } from './PhotoCarousel';

export interface ImageLightboxModalProps {
  slides: CarouselSlide[];
  initialIndex?: number;
  overallCaption?: string;
  onClose: () => void;
  onSyncIndex?: (index: number) => void;
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

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  slides,
  initialIndex = 0,
  overallCaption,
  onClose,
  onSyncIndex,
}) => {
  const total = slides.length;
  const safeInitial = total > 0 ? Math.min(Math.max(0, initialIndex), total - 1) : 0;
  const [currentIndex, setCurrentIndex] = useState<number>(safeInitial);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isFirstTrackSyncRef = useRef<boolean>(true);
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

  // Блокуємо прокрутку на рівні кореневого html (а не body), щоб sticky-шапка сайту
  // ніколи не втрачала позиціонування при будь-якому положенні скролу сторінки
  useEffect(() => {
    const htmlEl = document.documentElement;
    const prevHtmlOverflowY = htmlEl.style.overflowY;
    htmlEl.style.overflowY = 'hidden';

    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => {
      cancelAnimationFrame(raf);
      htmlEl.style.overflowY = prevHtmlOverflowY;
    };
  }, []);

  // Попереднє завантаження сусідніх слайдів для миттєвого перегортання
  useEffect(() => {
    if (total <= 1) return;
    const neighborIndices = [
      (currentIndex + 1) % total,
      (currentIndex - 1 + total) % total,
    ];
    neighborIndices.forEach((idx) => {
      const url = slides[idx]?.url;
      if (url) {
        const preloader = new Image();
        preloader.decoding = 'async';
        preloader.src = url;
      }
    });
  }, [currentIndex, slides, total]);

  // Синхронізація треку слайдів
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

  const updateIndex = useCallback(
    (nextIdx: number) => {
      setCurrentIndex(nextIdx);
      onSyncIndex?.(nextIdx);
    },
    [onSyncIndex]
  );

  const goToNext = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (total <= 1) return;
      updateIndex((currentIndex + 1) % total);
    },
    [currentIndex, total, updateIndex]
  );

  const goToPrev = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (total <= 1) return;
      updateIndex((currentIndex - 1 + total) % total);
    },
    [currentIndex, total, updateIndex]
  );

  // Клавіатурна навігація (Escape, стрілки вліво/вправо) + реакція на кнопку «Назад» браузера
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight' && total > 1) {
        e.preventDefault();
        updateIndex((currentIndex + 1) % total);
      } else if (e.key === 'ArrowLeft' && total > 1) {
        e.preventDefault();
        updateIndex((currentIndex - 1 + total) % total);
      }
    };

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [currentIndex, onClose, total, updateIndex]);

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
    const width = viewportRef.current?.clientWidth || 360;
    const distanceThreshold = Math.min(96, Math.max(38, width * 0.12));
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
      updateIndex(nextIdx);
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        didDragRef.current = false;
      }, 0);
    });
  }, [currentIndex, total, updateIndex]);

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

  if (typeof document === 'undefined' || total === 0) return null;

  const activeSlide = slides[currentIndex] || slides[0];
  const slideCaption = activeSlide?.caption?.trim() || '';
  const cleanOverall = overallCaption?.trim() || '';

  const handleBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('[data-lightbox-interactive="true"]')) {
      return;
    }
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Повноекранний перегляд фото"
      className={`fixed inset-0 z-50 flex flex-col bg-black/95 md:bg-black/92 md:backdrop-blur-md select-none overflow-hidden overscroll-contain transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Верхня панель (Header) модального вікна — повторює геометрію шапки сайту, фото сюди ніколи не заходить */}
      <header
        onClick={(e) => e.stopPropagation()}
        className="w-full py-3.5 sm:py-4 shrink-0 z-20 border-b border-white/10"
      >
        <div className="relative w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto flex items-center justify-between min-h-[38px]">
          <div className="flex items-center gap-3 z-20">
            <span className="hidden md:block brand-serif-title text-xl sm:text-2xl font-medium tracking-tight text-white/90 select-none">
              The Impart
            </span>
            {total > 1 && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 text-white/90 text-xs font-mono tracking-wider">
                <Images className="w-3.5 h-3.5 opacity-80" />
                <span>
                  {currentIndex + 1} / {total}
                </span>
              </div>
            )}
          </div>

          <div className="md:hidden absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <span className="block brand-serif-title text-xl font-medium tracking-tight text-white/90 select-none whitespace-nowrap">
              The Impart
            </span>
          </div>

          <div className="z-20 flex items-center justify-end -mr-1 sm:-mr-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-white/85 hover:text-white bg-white/10 hover:bg-white/20 active:scale-95 rounded-full transition-all cursor-pointer focus:outline-none flex items-center justify-center w-10 h-10"
              title="Закрити (Esc)"
              aria-label="Закрити повноекранний перегляд"
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>
        </div>
      </header>

      {/* Область Body під Header: симетричні відступи зверху й знизу тримають фото рівно по центру body */}
      <div
        ref={viewportRef}
        onClick={handleBodyClick}
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
        className={`carousel-viewport relative flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isVisible ? 'scale-100' : 'scale-[0.985]'
        }`}
      >
        <div ref={trackRef} className="carousel-track flex w-full h-full">
          {slides.map((slide, idx) => {
            const isNearby =
              Math.abs(idx - currentIndex) <= 1 ||
              (currentIndex === 0 && idx === total - 1) ||
              (currentIndex === total - 1 && idx === 0);

            return (
              <div
                key={`${slide.url}-${idx}`}
                className="w-full h-full shrink-0 flex items-center justify-center py-12 sm:py-16 px-3 sm:px-16"
              >
                <img
                  src={slide.url}
                  alt={slide.alt || slide.caption || `Фото ${idx + 1}`}
                  loading={isNearby ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                  data-lightbox-interactive="true"
                  className={`max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl select-none ${
                    total > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Стрілки перемикання у повноекранному режимі (по центру висоти body) */}
        {total > 1 && (
          <>
            <button
              type="button"
              data-lightbox-interactive="true"
              onClick={goToPrev}
              title="Попереднє фото (стрілка вліво)"
              aria-label="Попереднє фото"
              className="absolute left-2.5 sm:left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/25 active:scale-95 text-white backdrop-blur-md border border-white/15 flex items-center justify-center transition-all shadow-lg cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <button
              type="button"
              data-lightbox-interactive="true"
              onClick={goToNext}
              title="Наступне фото (стрілка вправо)"
              aria-label="Наступне фото"
              className="absolute right-2.5 sm:right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/25 active:scale-95 text-white backdrop-blur-md border border-white/15 flex items-center justify-center transition-all shadow-lg cursor-pointer"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </>
        )}

        {/* Нижня зона в межах симетричного відступу: підпис та індикатори слайдів */}
        {(slideCaption || cleanOverall || total > 1) && (
          <div className="absolute bottom-2.5 sm:bottom-3.5 left-0 right-0 flex flex-col items-center justify-center gap-1.5 px-4 sm:px-8 z-20 pointer-events-none">
            {(slideCaption || cleanOverall) && (
              <p
                data-lightbox-interactive="true"
                className="pointer-events-auto text-white/85 text-xs sm:text-sm text-center font-sans max-w-2xl line-clamp-2"
              >
                {slideCaption ? (
                  <>
                    {cleanOverall && cleanOverall !== slideCaption && (
                      <span className="font-medium text-white/95">{cleanOverall} • </span>
                    )}
                    <span>{slideCaption}</span>
                  </>
                ) : (
                  <span>{cleanOverall}</span>
                )}
              </p>
            )}

            {total > 1 && (
              <div
                data-lightbox-interactive="true"
                className="pointer-events-auto flex items-center gap-1.5"
              >
                {slides.map((_, idx) => {
                  const isActive = idx === currentIndex;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateIndex(idx);
                      }}
                      title={`Перейти до фото ${idx + 1}`}
                      aria-label={`Перейти до фото ${idx + 1}`}
                      className={`transition-all duration-300 cursor-pointer rounded-full ${
                        isActive
                          ? 'w-5 sm:w-6 h-1.5 bg-white'
                          : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/75'
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
