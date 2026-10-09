import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Chrono, type TimelineItem } from 'react-chrono'
import { Check, Clock, Copy, ExternalLink, MapPin, RotateCcw } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PhotoCarousel } from '@/components/photo-carousel'
import { COURSES, KIND_LABEL, MAP_LINKS, PHOTOS, SOURCES, TIPS, type Course, type Slot } from './data'

type Picks = Record<string, Record<string, string[]>>
const STORAGE_KEY = 'ct-date-course-picks-v1'

function defaultPicks(): Picks {
  const out: Picks = {}
  for (const c of COURSES) {
    out[c.id] = {}
    for (const s of c.slots) {
      const def = s.options.find((o) => o.isDefault)
      out[c.id][s.id] = s.kind === 'fixed' ? [s.options[0].id] : def ? [def.id] : []
    }
  }
  return out
}

function loadPicks(): Picks {
  const base = defaultPicks()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Picks
    for (const c of COURSES) {
      if (!parsed[c.id]) parsed[c.id] = {}
      for (const s of c.slots) {
        if (!Array.isArray(parsed[c.id][s.id])) parsed[c.id][s.id] = base[c.id][s.id]
      }
    }
    return parsed
  } catch {
    return base
  }
}

// --- live pick store -------------------------------------------------------
// Picks live in a module store and SlotCards subscribe directly. Selection
// changes therefore update cards in place instead of remounting the whole
// react-chrono timeline — remounts used to swap DOM out from under an
// in-flight click (pointerdown and pointerup landing on different nodes),
// which made clicks register only on a second try.
let pickState: Picks = loadPicks()
const pickListeners = new Set<() => void>()

function setPickState(next: Picks | ((prev: Picks) => Picks)) {
  pickState = typeof next === 'function' ? next(pickState) : next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pickState))
  for (const listener of pickListeners) listener()
}

function subscribePicks(callback: () => void) {
  pickListeners.add(callback)
  return () => {
    pickListeners.delete(callback)
  }
}

function usePickState(): Picks {
  return useSyncExternalStore(subscribePicks, () => pickState)
}

function buildSummary(course: Course, picks: Record<string, string[]>): string {
  const lines: string[] = [
    `🏮 인천 차이나타운 데이트 코스 — ${course.badge} ${course.name}`,
    `(${course.hours} · ${course.theme})`,
    '',
  ]
  for (const s of course.slots) {
    const sel = picks[s.id] ?? []
    const names = s.options.filter((o) => sel.includes(o.id)).map((o) => o.name)
    lines.push(`· ${s.time} ${s.title}: ${names.length ? names.join(' + ') : '미정'}`)
  }
  lines.push('', '출처: 인스타그램 리서치 기반 (2026.10)')
  return lines.join('\n')
}

const CHRONO_THEME = {
  primary: '#b23a2e',
  secondary: '#fbe9e4',
  cardBgColor: '#ffffff',
  cardDetailsBackGround: '#ffffff',
  cardDetailsColor: '#4a4038',
  cardTitleColor: '#26201b',
  cardSubtitleColor: '#8c7f74',
  titleColor: '#ffffff',
  titleColorActive: '#ffffff',
  textColor: '#26201b',
  timelineBgColor: 'transparent',
  iconColor: '#b23a2e',
  iconBackgroundColor: '#ffffff',
  toolbarBgColor: 'transparent',
  shadowColor: 'rgba(120, 60, 40, 0.22)',
  glowColor: '#b23a2e',
}

// Stable option objects: react-chrono rebinds its internal layout whenever one
// of these props changes identity, re-creating card containers. Fresh objects
// on every render made the timeline churn constantly and could swallow clicks
// that landed mid-churn.
const CHRONO_INTERACTION = {
  autoScroll: false,
  focusOnLoad: false,
  cardHover: false,
  keyboardNavigation: false,
  pointClick: false,
}
const CHRONO_DISPLAY = { toolbar: { enabled: false }, scrollable: false }
const CHRONO_CONTENT = { allowHTML: false, readMore: false, textOverlay: false }
const CHRONO_ANIMATION = { slideshow: { enabled: false } }

function useTimelineCardWidth(): number {
  const [width, setWidth] = useState(() => Math.max(230, Math.min(560, window.innerWidth - 150)))
  useEffect(() => {
    const onResize = () => setWidth(Math.max(230, Math.min(560, window.innerWidth - 150)))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

// Selection is applied on pointerup: pointerdown/pointerup always reach the
// button, while the synthetic `click` can be swallowed when react-chrono
// replaces card DOM mid-gesture (which made clicks need retries). Tracking is
// keyed by option id, not by node, because the node itself can be swapped
// between pointerdown and pointerup. The following real click is suppressed so
// Radix does not double-toggle; keyboard activation (detail = 0) is untouched.
let pressedOptionId: string | null = null
let lastPointerHandledAt = 0

function SlotCard({ courseId, slot }: { courseId: string; slot: Slot }) {
  const picks = usePickState()
  const selectedIds = picks[courseId]?.[slot.id] ?? []
  const fixed = slot.kind === 'fixed'
  const multiple = slot.kind === 'pick2'

  const apply = (ids: string[]) =>
    setPickState((prev) => ({ ...prev, [courseId]: { ...prev[courseId], [slot.id]: ids } }))

  const optionItems = slot.options.map((option) => {
    const on = selectedIds.includes(option.id)
    const photos = option.photos.map((k) => PHOTOS[k])
    const thumb = photos[0]
    const mapUrl = MAP_LINKS[option.id]
    const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
    return (
      <ToggleGroupItem
        key={option.id}
        value={option.id}
        onPointerDown={(e) => {
          if (e.button === 0) pressedOptionId = option.id
        }}
        onPointerUp={(e) => {
          const pressedId = pressedOptionId
          pressedOptionId = null
          if (e.button !== 0 || fixed || pressedId !== option.id) return
          if ((e.target as Element).closest('a, [data-carousel]')) return
          lastPointerHandledAt = performance.now()
          if (multiple) {
            const next = on ? selectedIds.filter((x) => x !== option.id) : [...selectedIds, option.id]
            apply(next.length > 2 ? next.slice(-2) : next)
          } else if (!on) {
            apply([option.id])
          }
        }}
        onClickCapture={(e) => {
          if (e.detail > 0 && performance.now() - lastPointerHandledAt < 500) {
            lastPointerHandledAt = 0
            e.stopPropagation()
            e.preventDefault()
          }
        }}
        className={cn(
          'group/opt flex-col items-stretch h-auto w-full justify-start rounded-xl border border-border bg-card p-2.5 text-left whitespace-normal shadow-none',
          'hover:border-muted-foreground/30 data-[state=on]:border-primary data-[state=on]:bg-secondary/40 data-[state=on]:shadow-none',
          fixed && 'cursor-default',
        )}
      >
        <span className="flex w-full items-center gap-3">
          {!on && (
            <span className="block size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
              {thumb ? (
                <img
                  src={thumb.src}
                  alt={thumb.alt}
                  loading="lazy"
                  className="size-12 object-cover"
                />
              ) : (
                <span className="flex size-12 items-center justify-center text-base">🏮</span>
              )}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
              {on && <Check className="size-4 shrink-0 text-primary" />}
              {option.name}
              {option.tags?.map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800"
                >
                  {t}
                </Badge>
              ))}
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">
              {option.detail}
            </span>
          </span>
          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              onClick={stop}
              title="네이버 지도로 보기"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <MapPin className="size-3" />
              지도
            </a>
          )}
        </span>
        {on && photos.length > 0 && <PhotoCarousel photos={photos} />}
        {on && option.desc && (
          <span className="mt-2 block w-full text-[13px] leading-relaxed text-foreground/85">
            {option.desc}
          </span>
        )}
      </ToggleGroupItem>
    )
  })

  return (
    <div className="flex w-full flex-col items-start gap-2.5">
      <Badge
        variant="outline"
        className={cn(
          'h-5 px-2 text-[11px] font-bold',
          fixed
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-transparent bg-secondary text-secondary-foreground',
        )}
      >
        {KIND_LABEL[slot.kind]}
        {slot.note ? ` · ${slot.note}` : ''}
      </Badge>

      {multiple ? (
        <ToggleGroup
          type="multiple"
          value={selectedIds}
          onValueChange={(ids: string[]) => apply(ids.length > 2 ? ids.slice(-2) : ids)}
          className="w-full flex-col items-stretch gap-2"
        >
          {optionItems}
        </ToggleGroup>
      ) : (
        <ToggleGroup
          type="single"
          value={selectedIds[0] ?? ''}
          onValueChange={(value: string) => {
            if (value) apply([value])
          }}
          className="w-full flex-col items-stretch gap-2"
        >
          {optionItems}
        </ToggleGroup>
      )}
    </div>
  )
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}

function countFilled(course: Course, coursePicks: Record<string, string[]>) {
  return course.slots.filter((s) => s.kind !== 'fixed' && (coursePicks[s.id]?.length ?? 0) > 0).length
}

function countPickable(course: Course) {
  return course.slots.filter((s) => s.kind !== 'fixed').length
}

function useCopySummary(course: Course, coursePicks: Record<string, string[]>) {
  const [copied, setCopied] = useState(false)
  async function copySummary() {
    await copyText(buildSummary(course, coursePicks))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return { copied, copySummary }
}

// These subscribe to the pick store themselves so App itself does not re-render
// (and therefore the timeline does not re-render) on every selection change.
function CourseSummaryCard({ course }: { course: Course }) {
  const picks = usePickState()
  const coursePicks = picks[course.id] ?? {}
  const { copied, copySummary } = useCopySummary(course, coursePicks)
  const filledCount = countFilled(course, coursePicks)
  const pickableCount = countPickable(course)

  return (
    <Card className="mt-8 gap-3 py-5">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg font-extrabold">
          📋 선택 요약
          <Badge variant="secondary" className="h-6 px-2.5 text-xs font-bold">
            {filledCount}/{pickableCount} 선택
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {course.slots.map((s) => {
            const sel = coursePicks[s.id] ?? []
            const names = s.options.filter((o) => sel.includes(o.id)).map((o) => o.name)
            return (
              <li key={s.id} className="flex gap-3 py-2 text-[13.5px]">
                <span className="w-12 shrink-0 font-extrabold text-primary tabular-nums">
                  {s.time}
                </span>
                <span>
                  <b className="font-bold">{s.title}</b> —{' '}
                  {names.length ? names.join(' + ') : '미정'}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button size="lg" className="h-10 px-4 font-bold" onClick={copySummary}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? '복사됨' : '요약 텍스트 복사'}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-10 px-4 font-bold"
            onClick={() => setPickState((prev) => ({ ...prev, [course.id]: defaultPicks()[course.id] }))}
          >
            <RotateCcw className="size-4" />
            기본값으로 초기화
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          선택은 이 브라우저에 자동 저장돼요 — 요약 복사로 밖으로 꺼낼 수 있어요.
        </p>
      </CardContent>
    </Card>
  )
}

function CourseBottomBar({ course }: { course: Course }) {
  const picks = usePickState()
  const coursePicks = picks[course.id] ?? {}
  const { copied, copySummary } = useCopySummary(course, coursePicks)
  const filledCount = countFilled(course, coursePicks)
  const pickableCount = countPickable(course)

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
        <span className="truncate text-[13.5px] font-bold">
          {course.badge} {course.name.replace(' 코스', '')} · {filledCount}/{pickableCount} 선택
        </span>
        <Button className="h-9 shrink-0 px-3.5 font-bold" onClick={copySummary}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? '복사됨' : '요약 복사'}
        </Button>
      </div>
    </div>
  )
}

export default function App() {
  const [activeId, setActiveId] = useState<string>(COURSES[0].id)
  const panelRef = useRef<HTMLDivElement>(null)
  const cardWidth = useTimelineCardWidth()
  const chronoLayout = useMemo(
    () => ({ cardWidth, cardHeight: 'auto' as const, lineWidth: 2, pointSize: 14, timelineHeight: 'auto' as const }),
    [cardWidth],
  )

  const course = useMemo(() => COURSES.find((c) => c.id === activeId) ?? COURSES[0], [activeId])

  function selectCourse(id: string) {
    setActiveId(id)
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // Element content stays stable per course; live selection state flows through
  // the store subscription inside SlotCard, so the timeline never remounts.
  const timelineItems: TimelineItem[] = useMemo(
    () =>
      course.slots.map((slot) => ({
        id: slot.id,
        title: slot.time,
        cardTitle: slot.title,
        timelineContent: <SlotCard courseId={course.id} slot={slot} />,
      })),
    [course],
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 pt-4 pb-28">
        <header className="relative flex min-h-[250px] items-end overflow-hidden rounded-3xl shadow-lg shadow-red-950/10">
          <img
            className="absolute inset-0 h-full w-full object-cover"
            src={PHOTOS.yeongyeongPano.src}
            alt="연경 전경"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
          <div className="relative p-6 text-white">
            <p className="mb-2 text-xs tracking-wide text-orange-100/90">
              인스타그램 리서치 기반 · 사진 출처 표기
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              🏮 인천 차이나타운 데이트 코스
            </h1>
            <p className="mt-2 text-sm text-orange-50/90">
              코스 4개 중 하나를 고르고, 슬롯마다 선택지를 골라 나만의 코스로
            </p>
          </div>
        </header>

        <Tabs value={course.id} onValueChange={selectCourse} className="gap-0">
          <TabsList className="group-data-horizontal/tabs:h-auto sticky top-0 z-20 -mx-4 mt-2 flex h-auto w-[calc(100%+2rem)] flex-nowrap justify-start gap-2 overflow-x-auto overflow-y-hidden rounded-none border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur">
            {COURSES.map((c) => (
              <TabsTrigger
                key={c.id}
                value={c.id}
                className="h-9 flex-none rounded-full border border-border bg-card px-4 text-sm font-bold text-foreground shadow-none transition-colors data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none hover:text-foreground"
              >
                {c.badge} {c.name.replace(' 코스', '')}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold tracking-tight">📋 코스 한눈에 비교</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {COURSES.map((c) => (
              <Card
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => selectCourse(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') selectCourse(c.id)
                }}
                className={cn(
                  'cursor-pointer gap-3 py-4 transition-all hover:-translate-y-0.5 hover:shadow-md',
                  c.id === course.id && 'ring-2 ring-primary/40',
                )}
              >
                <CardHeader className="gap-1">
                  <CardTitle className="flex items-center gap-2 text-[15px] font-extrabold">
                    <span className="text-base">{c.badge}</span>
                    {c.name}
                  </CardTitle>
                  <CardDescription className="text-[12.5px] font-semibold text-secondary-foreground">
                    {c.theme}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" /> {c.hours} · {c.when}
                  </p>
                  <p className="text-[13px] leading-relaxed">{c.tagline}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <div ref={panelRef} id="course-panel" className="scroll-mt-20" />

        <Card className="mt-8 gap-3 py-5">
          <CardHeader className="gap-1.5">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg font-extrabold">
              <span>
                {course.badge} {course.name}
              </span>
              <Badge variant="secondary" className="h-6 px-2.5 text-xs font-bold">
                <Clock className="size-3.5" /> {course.hours}
              </Badge>
            </CardTitle>
            <CardDescription className="text-[13.5px] leading-relaxed">
              {course.tagline}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-[12.5px] text-muted-foreground">
            추천: {course.when}
          </CardContent>
        </Card>

        <section className="chrono-wrap mt-6">
          <Chrono
            key={course.id}
            items={timelineItems}
            mode="vertical"
            theme={CHRONO_THEME}
            layout={chronoLayout}
            interaction={CHRONO_INTERACTION}
            display={CHRONO_DISPLAY}
            content={CHRONO_CONTENT}
            animation={CHRONO_ANIMATION}
            allowDynamicUpdate
          />
        </section>

        <CourseSummaryCard course={course} />

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold tracking-tight">💡 실전 팁</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-4">
            {TIPS.map((t) => (
              <li key={t} className="flex gap-2.5 py-3 text-sm leading-relaxed">
                <span className="shrink-0">🏮</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold tracking-tight">📎 리서치 출처 (Instagram)</h2>
          <Card className="gap-0 py-2">
            <CardContent className="flex flex-col">
              {SOURCES.map((s, i) => (
                <div key={s.url}>
                  {i > 0 && <Separator />}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                  >
                    <span>{s.label}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <footer className="mt-8 text-xs leading-relaxed text-muted-foreground">
          사진은 각 인스타그램 게시물에서 수집했으며 캡션에 계정을 표기했습니다. 개인 열람용 정리
          페이지 · 2026.10 기준 자료.
        </footer>
      </div>

      <CourseBottomBar course={course} />
    </div>
  )
}
