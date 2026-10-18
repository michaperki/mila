import {
  Canvas,
  Circle,
  createPicture,
  LinearGradient,
  Picture,
  RadialGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { AppState, LayoutChangeEvent, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FrameInfo, useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { generateTree } from './geometry/generateTree';
import { applyDrag, applyTap, celebrate, HIT_BRANCH, HIT_FOLIAGE, HIT_POT } from './interaction/touch';
import { drawBonsai } from './render/drawTree';
import { createSimState, SimTargets } from './sim/state';
import { stepSim } from './sim/step';
import { hourNow, skyAt } from './sky';

export type BonsaiPart = 'foliage' | 'branch' | 'pot';

export interface BonsaiProps {
  /** Long-term progress, 0..100. */
  growth: number;
  /** Accumulated neglect, 0..100. */
  overgrowth: number;
  /** Current liveliness, 0..100. */
  vitality: number;
  /** Which tree to grow. Same seed, same tree. */
  seed?: number;
  /** Wind and breathing. Touch and transitions still animate when off. */
  ambient?: boolean;
  /** Stop the frame loop entirely (e.g. when the screen is not focused). */
  paused?: boolean;
  interactive?: boolean;
  haptics?: boolean;
  /** Draw the warm backdrop and sun disc; turn off to sit on your own background. */
  background?: boolean;
  /** Local hour (0..24) the backdrop's light follows. Defaults to now. */
  hour?: number;
  /** Room kept clear above and below the tree (px); the backdrop still fills the view. */
  inset?: { top?: number; bottom?: number };
  debug?: boolean;
  onTouchPart?: (part: BonsaiPart) => void;
  style?: StyleProp<ViewStyle>;
}

export interface BonsaiHandle {
  /** Play the "studied" reaction: a warm pulse and sparkles. */
  celebrate: () => void;
}

/** Part of the 1000x1000 world that is framed in the view. */
const VIEW = { x: 0, y: 60, w: 1000, h: 860 };

/** Log a UI-thread error (with stack) once per phase instead of every frame. */
function reportOnce(phase: string, e: unknown) {
  'worklet';
  const g = globalThis as unknown as { __bonsaiErr?: Record<string, boolean> };
  if (!g.__bonsaiErr) g.__bonsaiErr = {};
  if (g.__bonsaiErr[phase]) return;
  g.__bonsaiErr[phase] = true;
  const err = e as { message?: string; stack?: string };
  console.error(`[bonsai ${phase}] ${err?.message ?? String(e)}\n${err?.stack ?? ''}`);
}

function toTargets(p: BonsaiProps): SimTargets {
  const c = (x: number) => Math.max(0, Math.min(100, x)) / 100;
  return {
    growth: c(p.growth),
    overgrowth: c(p.overgrowth),
    vitality: c(p.vitality),
    ambient: p.ambient ?? true,
    debug: p.debug ?? false,
  };
}

export const Bonsai = forwardRef<BonsaiHandle, BonsaiProps>(function Bonsai(props, ref) {
  const {
    seed = 7,
    ambient = true,
    paused = false,
    interactive = true,
    haptics = true,
    background = true,
    debug = false,
    hour,
    inset,
    onTouchPart,
    style,
  } = props;

  const tree = useMemo(() => generateTree(seed), [seed]);
  const [initial] = useState(() => createSimState(tree, toTargets(props)));
  const treeSV = useSharedValue(tree);
  const sim = useSharedValue(initial);
  const targets = useSharedValue(toTargets(props));
  const layout = useSharedValue({ s: 1, ox: 0, oy: 0 });
  const fps = useSharedValue(60);
  const [size, setSize] = useState({ w: 0, h: 0, s: 1, ox: 0, oy: 0 });

  useEffect(() => {
    treeSV.value = tree;
  }, [tree, treeSV]);

  useEffect(() => {
    targets.value = toTargets({ growth: props.growth, overgrowth: props.overgrowth, vitality: props.vitality, ambient, debug });
  }, [props.growth, props.overgrowth, props.vitality, ambient, debug, targets]);

  // ---- The frame loop: one mutation of the sim per frame, all on the UI thread.
  const step = useCallback(
    (info: FrameInfo) => {
      'worklet';
      const dt = info.timeSincePreviousFrame == null ? 1 / 60 : info.timeSincePreviousFrame / 1000;
      sim.modify((s) => {
        'worklet';
        try {
          stepSim(s, treeSV.value, targets.value, dt);
        } catch (e) {
          reportOnce('step', e);
        }
        if (targets.value.debug && Math.floor(s.time * 2) !== Math.floor((s.time - dt) * 2)) {
          fps.value = Math.round(s.fps);
        }
        return s;
      });
    },
    [sim, treeSV, targets, fps]
  );
  const frame = useFrameCallback(step, false);

  // Pause when backgrounded or asked to.
  useEffect(() => {
    const update = () => frame.setActive(AppState.currentState !== 'background' && !paused);
    update();
    const sub = AppState.addEventListener('change', update);
    return () => sub.remove();
  }, [paused, frame]);

  // ---- Drawing: the whole tree is re-recorded into one picture when the sim changes.
  const picture = useDerivedValue(() => {
    const L = layout.value;
    const s = sim.value;
    const tr = treeSV.value;
    const dbg = targets.value.debug;
    return createPicture((canvas) => {
      'worklet';
      canvas.translate(L.ox, L.oy);
      canvas.scale(L.s, L.s);
      try {
        drawBonsai(canvas, tr, s, dbg);
      } catch (e) {
        reportOnce('draw', e);
      }
    });
  });

  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox({ w, h });
  }, []);
  const insetTop = inset?.top ?? 0;
  const insetBottom = inset?.bottom ?? 0;
  useEffect(() => {
    const { w, h } = box;
    if (!w || !h) return;
    const room = Math.max(1, h - insetTop - insetBottom);
    const s = Math.min(w / VIEW.w, room / VIEW.h);
    const ox = (w - VIEW.w * s) / 2 - VIEW.x * s;
    const oy = insetTop + (room - VIEW.h * s) / 2 - VIEW.y * s;
    layout.value = { s, ox, oy };
    setSize({ w, h, s, ox, oy });
  }, [box, insetTop, insetBottom, layout]);

  // ---- Touch.
  const onHit = useCallback(
    (hit: number) => {
      const part: BonsaiPart = hit === HIT_POT ? 'pot' : hit === HIT_BRANCH ? 'branch' : 'foliage';
      if (haptics && Platform.OS !== 'web') {
        if (part === 'pot') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        else if (part === 'branch') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        else Haptics.selectionAsync();
      }
      onTouchPart?.(part);
    },
    [haptics, onTouchPart]
  );

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .enabled(interactive)
      .maxDuration(350)
      .onEnd((e, success) => {
        'worklet';
        if (!success) return;
        const L = layout.value;
        const x = (e.x - L.ox) / L.s;
        const y = (e.y - L.oy) / L.s;
        sim.modify((s) => {
          'worklet';
          s.lastHit = applyTap(s, treeSV.value, x, y);
          return s;
        });
        const hit = sim.value.lastHit;
        if (hit === HIT_FOLIAGE || hit === HIT_BRANCH || hit === HIT_POT) scheduleOnRN(onHit, hit);
      });
    const pan = Gesture.Pan()
      .enabled(interactive)
      .minDistance(6)
      .onChange((e) => {
        'worklet';
        const L = layout.value;
        const x = (e.x - L.ox) / L.s;
        const y = (e.y - L.oy) / L.s;
        const dx = e.changeX / L.s;
        const dy = e.changeY / L.s;
        sim.modify((s) => {
          'worklet';
          applyDrag(s, treeSV.value, x, y, dx, dy);
          return s;
        });
      });
    return Gesture.Race(pan, tap);
  }, [layout, sim, treeSV, onHit, interactive]);

  useImperativeHandle(
    ref,
    () => ({
      celebrate: () => {
        scheduleOnUI(() => {
          'worklet';
          sim.modify((s) => {
            'worklet';
            celebrate(s, treeSV.value);
            return s;
          });
        });
        if (haptics && Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
    }),
    [sim, treeSV, haptics]
  );

  const sky = useMemo(() => skyAt(hour ?? hourNow()), [hour]);
  const sunR = 330 * size.s;
  const sunX = size.ox + 500 * size.s;
  const sunY = size.oy + sky.sunY * size.s;
  const tableY = size.oy + 884 * size.s;

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.root, style]} onLayout={onLayout} collapsable={false}>
        {size.w > 0 && (
          <Canvas style={StyleSheet.absoluteFill}>
            {background && (
              <>
                <Rect x={0} y={0} width={size.w} height={size.h}>
                  <LinearGradient start={vec(0, 0)} end={vec(0, size.h)} colors={[sky.top, sky.bottom]} />
                </Rect>
                <Circle cx={sunX} cy={sunY} r={sunR}>
                  <RadialGradient
                    c={vec(sunX, sunY)}
                    r={sunR}
                    colors={[`${sky.sun}EE`, `${sky.sun}BB`, `${sky.sun}00`]}
                    positions={[0, 0.93, 1]}
                  />
                </Circle>
                <Rect x={0} y={tableY} width={size.w} height={Math.max(0, size.h - tableY)} color="#E4CDB2" opacity={0.55} />
              </>
            )}
            <Picture picture={picture} />
          </Canvas>
        )}
        {debug && <FpsLabel fps={fps} />}
      </View>
    </GestureDetector>
  );
});

/** Debug-only fps readout, polled at 2 Hz so it never touches the frame loop. */
function FpsLabel({ fps }: { fps: { value: number } }) {
  const [value, setValue] = useState(60);
  useEffect(() => {
    const id = setInterval(() => setValue(fps.value), 500);
    return () => clearInterval(id);
  }, [fps]);
  return <Text style={styles.fps}>{value} fps</Text>;
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  fps: {
    position: 'absolute',
    top: 8,
    left: 10,
    fontSize: 11,
    fontWeight: '600',
    color: '#5b4636',
    backgroundColor: '#ffffffaa',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
