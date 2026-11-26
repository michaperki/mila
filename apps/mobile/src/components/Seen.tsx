import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, View, type ViewStyle } from 'react-native'
import { seen, useVisit } from '../lib/usage'

// A panel coming into view, for the Usage view (lib/usage.ts `seen`): on screen is not the same
// as used, so a panel that is only looked at is recorded apart from the controls in it. A Page
// (components/ui.tsx) says what part of it is in view; a <Seen> directly inside one records its
// panel once per visit, when its top is in view.
type Viewport = { top: number; height: number; listeners: Set<() => void> }
export const ViewportContext = createContext<Viewport | null>(null)

// One mutable viewport per page, made once, with its handlers (no rerender as it scrolls).
export function useViewport() {
  const [handle] = useState(() => {
    const viewport: Viewport = { top: 0, height: 0, listeners: new Set() }
    const notify = () => viewport.listeners.forEach(listener => listener())
    return {
      viewport,
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        viewport.top = event.nativeEvent.contentOffset.y; viewport.height = event.nativeEvent.layoutMeasurement.height; notify()
      },
      onLayout: (event: LayoutChangeEvent) => { viewport.height = event.nativeEvent.layout.height; notify() },
    }
  })
  return handle
}

const TOP_IN_VIEW = 60
export function Seen({ surface, panel, style, children }: { surface: string; panel: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const viewport = useContext(ViewportContext)
  const visit = useVisit()
  const box = useRef<{ y: number; height: number } | null>(null)
  const logged = useRef<number | null>(null)
  const check = useCallback(() => {
    if (visit === null || logged.current === visit || !box.current) return
    const { y, height } = box.current
    if (viewport && !(viewport.height > 0 && y + Math.min(height, TOP_IN_VIEW) <= viewport.top + viewport.height && y + height >= viewport.top)) return
    logged.current = visit
    seen(surface, panel)
  }, [visit, viewport, surface, panel])
  useEffect(() => {
    if (!viewport) return
    viewport.listeners.add(check)
    check()
    return () => { viewport.listeners.delete(check) }
  }, [viewport, check])
  return <View style={style} onLayout={event => { box.current = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height }; check() }}>{children}</View>
}
