import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill } from "remotion";
import { Browser } from "./scenes/Browser";
import { Capsule } from "./scenes/Capsule";
import { Delta } from "./scenes/Delta";
import { Hook } from "./scenes/Hook";
import { Outro } from "./scenes/Outro";
import { Passport } from "./scenes/Passport";
import { Terminal } from "./scenes/Terminal";

export const T = 12; // cross-fade frames between scenes
const timing = linearTiming({ durationInFrames: T });
const presentation = fade();

export const SCENES = [105, 150, 270, 150, 120, 135, 90] as const;
export const TOTAL = SCENES.reduce((a, b) => a + b, 0) - T * (SCENES.length - 1);

export const AttestDemo: React.FC = () => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Hook" durationInFrames={SCENES[0]}><Hook /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={presentation} timing={timing} />
      <TransitionSeries.Sequence name="Build delta" durationInFrames={SCENES[1]}><Delta /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={presentation} timing={timing} />
      <TransitionSeries.Sequence name="Terminal" durationInFrames={SCENES[2]}><Terminal /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={presentation} timing={timing} />
      <TransitionSeries.Sequence name="Passport" durationInFrames={SCENES[3]}><Passport /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={presentation} timing={timing} />
      <TransitionSeries.Sequence name="Capsule" durationInFrames={SCENES[4]}><Capsule /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={presentation} timing={timing} />
      <TransitionSeries.Sequence name="Browser" durationInFrames={SCENES[5]}><Browser /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={presentation} timing={timing} />
      <TransitionSeries.Sequence name="Outro" durationInFrames={SCENES[6]}><Outro /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
