import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel'
import type { Photo } from '@/data'

export function PhotoCarousel({ photos }: { photos: Photo[] }) {
  const [api, setApi] = useState<CarouselApi | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!api) return
    const onSelect = () => setIndex(api.selectedScrollSnap())
    onSelect()
    api.on('select', onSelect)
    return () => {
      api.off('select', onSelect)
    }
  }, [api])

  const multi = photos.length > 1
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <span className="mt-3 block w-full" data-carousel="" onClick={stop}>
      <Carousel opts={{ loop: true, align: 'start' }} setApi={setApi} className="w-full">
        <CarouselContent className="-ml-3">
          {photos.map((p) => (
            <CarouselItem key={p.src} className="pl-3">
              <img
                src={p.src}
                alt={p.alt}
                loading="lazy"
                className="block h-52 w-full rounded-xl bg-muted object-cover sm:h-60"
              />
              <span className="mt-1.5 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                  {p.alt} · {p.credit}
                </span>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline"
                  >
                    출처
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </span>
            </CarouselItem>
          ))}
        </CarouselContent>

        {multi && (
          <>
            <span
              role="button"
              aria-label="이전 사진"
              onClick={(e) => {
                stop(e)
                api?.scrollPrev()
              }}
              className="absolute top-1/2 left-2 z-10 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 text-foreground shadow ring-1 ring-border hover:bg-white"
            >
              <ChevronLeft className="size-4" />
            </span>
            <span
              role="button"
              aria-label="다음 사진"
              onClick={(e) => {
                stop(e)
                api?.scrollNext()
              }}
              className="absolute top-1/2 right-2 z-10 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 text-foreground shadow ring-1 ring-border hover:bg-white"
            >
              <ChevronRight className="size-4" />
            </span>
            <span className="pointer-events-none absolute top-2 right-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
              {index + 1}/{photos.length}
            </span>
          </>
        )}
      </Carousel>
    </span>
  )
}
