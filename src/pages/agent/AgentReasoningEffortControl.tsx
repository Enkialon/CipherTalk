import { useEffect, useState, type CSSProperties } from 'react'
import { Button, Card, Popover, Slider, Tooltip } from '@heroui/react'
// 图标用项目直连的 @gravity-ui/icons（lucide-react 只是 @lobehub 的传递依赖，直接引会在依赖重装后失踪）
import { Bulb, ChevronDown, CircleQuestion } from '@gravity-ui/icons'
import type { AgentReasoningEffort } from '@/features/aiagent/transport/ipcChatTransport'
import { REASONING_EFFORT_OPTIONS, reasoningEffortLabel } from './agentPromptPresets'

type AgentReasoningEffortControlProps = {
  value: AgentReasoningEffort
  onChange: (value: AgentReasoningEffort) => void
}

const DEFAULT_EFFORT: AgentReasoningEffort = 'high'
const DEFAULT_EFFORT_INDEX = REASONING_EFFORT_OPTIONS.findIndex((option) => option.value === DEFAULT_EFFORT)
const MAX_INDEX = REASONING_EFFORT_OPTIONS.length - 1

// max 档 LED 网格：右侧两列（5 行 × 2 列 = 10 格）持续产生随机亮度，逐帧向左滚动。
const ULTRA_ROWS = 5
const ULTRA_COLS = 96
const ULTRA_SOURCE_COLS = 2
const ULTRA_DARK_COLS = 2
const ULTRA_TICK_MS = 120
const ULTRA_DECAY = 0.94
const ULTRA_TONE_COUNT = 6

type UltraLed = {
  level: number
  tone: number
}

const ULTRA_OFF_LED: UltraLed = { level: 0, tone: 0 }

const ultraGridStyle = {
  '--ct-ultra-cols': ULTRA_COLS,
  '--ct-ultra-rows': ULTRA_ROWS,
} as CSSProperties

function randomSourceLed(): UltraLed {
  return {
    level: 0.08 + Math.random() * 0.92,
    tone: Math.floor(Math.random() * ULTRA_TONE_COUNT),
  }
}

function createUltraFrame(): UltraLed[] {
  return Array.from({ length: ULTRA_ROWS * ULTRA_COLS }, (_, index) => {
    const col = index % ULTRA_COLS
    if (col < ULTRA_DARK_COLS) return ULTRA_OFF_LED
    const distanceSteps = Math.floor((ULTRA_COLS - 1 - col) / ULTRA_SOURCE_COLS)
    const source = randomSourceLed()
    return { ...source, level: source.level * Math.pow(ULTRA_DECAY, distanceSteps) }
  })
}

function advanceUltraFrame(previous: UltraLed[]): UltraLed[] {
  const next = Array<UltraLed>(ULTRA_ROWS * ULTRA_COLS).fill(ULTRA_OFF_LED)

  for (let row = 0; row < ULTRA_ROWS; row += 1) {
    const rowOffset = row * ULTRA_COLS
    for (let col = ULTRA_DARK_COLS; col < ULTRA_COLS - ULTRA_SOURCE_COLS; col += 1) {
      const shifted = previous[rowOffset + col + ULTRA_SOURCE_COLS] ?? ULTRA_OFF_LED
      const shiftedLevel = shifted.level * ULTRA_DECAY
      next[rowOffset + col] = shiftedLevel < 0.025
        ? ULTRA_OFF_LED
        : { level: shiftedLevel, tone: shifted.tone }
    }
    for (let col = ULTRA_COLS - ULTRA_SOURCE_COLS; col < ULTRA_COLS; col += 1) {
      next[rowOffset + col] = randomSourceLed()
    }
  }

  return next
}

function UltraReasoningGrid() {
  const [levels, setLevels] = useState(createUltraFrame)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setLevels(advanceUltraFrame), ULTRA_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div
      aria-hidden
      className="ct-agent-reasoning-ultra-grid absolute inset-y-0 -inset-x-3 overflow-hidden rounded-full"
      style={ultraGridStyle}
    >
      {levels.map((led, index) => (
        <span
          className="ct-agent-reasoning-cell"
          data-tone={led.tone}
          key={index}
          style={{ opacity: led.level }}
        />
      ))}
    </div>
  )
}

function sliderValue(value: number | number[]): number {
  return Array.isArray(value) ? value[0] ?? DEFAULT_EFFORT_INDEX : value
}

export function AgentReasoningEffortControl({ value, onChange }: AgentReasoningEffortControlProps) {
  const rawIndex = REASONING_EFFORT_OPTIONS.findIndex((option) => option.value === value)
  const selectedIndex = rawIndex >= 0 ? rawIndex : DEFAULT_EFFORT_INDEX
  const selectedEffort = REASONING_EFFORT_OPTIONS[selectedIndex] ?? REASONING_EFFORT_OPTIONS[DEFAULT_EFFORT_INDEX]
  const committedIsMax = selectedEffort.value === 'max'

  // 本地浮点值：拖动期间只动它，onChange 留到松手才提交——
  // 拖动中就回写父级会触发 selectedIndex 同步，把滑块拽回整数档，手感生硬
  const [localValue, setLocalValue] = useState<number>(selectedIndex)

  useEffect(() => {
    setLocalValue(selectedIndex)
  }, [selectedIndex])

  // 拖动期间的实时档位：标题文字和 max 视觉跟手变化
  const displayIndex = Math.min(Math.max(Math.round(localValue), 0), MAX_INDEX)
  const displayEffort = REASONING_EFFORT_OPTIONS[displayIndex] ?? selectedEffort
  const isMax = displayEffort.value === 'max'
  const percent = MAX_INDEX > 0 ? Math.min(Math.max(localValue / MAX_INDEX, 0), 1) : 0

  const handleChange = (nextValue: number | number[]) => {
    setLocalValue(sliderValue(nextValue))
  }

  const handleChangeEnd = (nextValue: number | number[]) => {
    const finalIndex = Math.min(Math.max(Math.round(sliderValue(nextValue)), 0), MAX_INDEX)
    setLocalValue(finalIndex) // 松手吸附到最近档位
    const option = REASONING_EFFORT_OPTIONS[finalIndex]
    if (option) onChange(option.value)
  }

  // 键盘走整档：step=0.01 是给指针拖动用的，方向键若按 0.01 步进，
  // 松手吸附会把位移抹掉；捕获阶段拦下来直接跳档
  const commitIndex = (nextIndex: number) => {
    const clamped = Math.min(Math.max(nextIndex, 0), MAX_INDEX)
    setLocalValue(clamped)
    const option = REASONING_EFFORT_OPTIONS[clamped]
    if (option) onChange(option.value)
  }

  const handleSliderKeyDownCapture = (event: React.KeyboardEvent) => {
    const arrowDelta: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }
    let nextIndex: number | null = null
    if (event.key in arrowDelta) nextIndex = displayIndex + arrowDelta[event.key]
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = MAX_INDEX
    if (nextIndex === null) return
    event.preventDefault()
    event.stopPropagation()
    commitIndex(nextIndex)
  }

  return (
    <Popover>
      <Button
        aria-label={`思考强度：${selectedEffort.label}`}
        className={committedIsMax ? 'text-accent' : undefined}
        size="sm"
        variant="tertiary"
      >
        <Bulb aria-hidden className="size-3.5 shrink-0" />
        <span className="text-xs">{reasoningEffortLabel(selectedEffort.value, true)}</span>
        <ChevronDown aria-hidden className="size-3 shrink-0" />
      </Button>

      <Popover.Content
        className="w-[min(20rem,calc(100vw-1.5rem))] overflow-visible border-0 bg-transparent p-0 shadow-none"
        offset={8}
        placement="top end"
        shouldFlip
      >
        <Popover.Dialog className="p-0">
          <Card>
            <Card.Header className="flex-row items-center justify-between">
              <Card.Title>
                思考强度 <span className={isMax ? 'text-accent' : 'text-muted-foreground'}>{displayEffort.label}</span>
              </Card.Title>
              <Tooltip closeDelay={80} delay={120}>
                <Tooltip.Trigger>
                  <Button aria-label="思考强度说明" isIconOnly size="sm" variant="ghost">
                    <CircleQuestion aria-hidden className="size-4" />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content placement="top end">强度越高，回答通常越深入，但响应更慢、消耗更多</Tooltip.Content>
              </Tooltip>
            </Card.Header>

            <Card.Content>
              <div aria-hidden className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>更快</span>
                <span>更聪明</span>
              </div>

              {/* step=0.01：react-aria 默认 step=1 会在拖动中把值量化到整数档，拇指一顿一顿；
                  小步长让拖动连续跟手，松手在 onChangeEnd 里吸附 */}
              <div onKeyDownCapture={handleSliderKeyDownCapture}>
                <Slider
                  aria-label="选择思考强度"
                  className="mt-2 w-full"
                  maxValue={MAX_INDEX}
                  minValue={0}
                  step={0.01}
                  value={localValue}
                  onChange={handleChange}
                  onChangeEnd={handleChangeEnd}
                >
                {/* HeroUI 轨道自带两侧 0.75rem 透明边框，拇指天然内嵌；
                    自绘层用 -inset-x-3 越过透明边框铺满整条胶囊 */}
                <Slider.Track className="ct-agent-reasoning-track relative h-6 w-full">
                  {isMax ? (
                    <UltraReasoningGrid />
                  ) : (
                    <div
                      aria-hidden
                      className="ct-agent-reasoning-fill absolute inset-y-0 -left-3 rounded-l-full"
                      style={{ width: `calc(${(percent * 100).toFixed(3)}% + 20px)` }}
                    />
                  )}
                  {!isMax && (
                    <div aria-hidden className="pointer-events-none absolute -inset-x-0.5 inset-y-0 flex items-center justify-between">
                      {REASONING_EFFORT_OPTIONS.map((option, index) => (
                        <span
                          className={`size-1 rounded-full ${
                            index === MAX_INDEX ? 'ct-agent-reasoning-dot-max' : 'bg-foreground/30'
                          }`}
                          key={option.value}
                        />
                      ))}
                    </div>
                  )}
                  <Slider.Thumb className="ct-agent-reasoning-thumb" data-max={isMax || undefined} />
                </Slider.Track>
                </Slider>
              </div>
              <span aria-live="polite" className="sr-only">当前思考强度：{displayEffort.label}</span>
            </Card.Content>
          </Card>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
