import React from 'react';
import {AbsoluteFill,useCurrentFrame,useVideoConfig} from 'remotion';
import {Atmosphere,Card,CutFlash,Header,MovieWindow} from './visuals';

export const Battle = () => {
  const {fps}=useVideoConfig();
  return <AbsoluteFill><Atmosphere /><Header title="UNLIKELY ALLIES. DEADLY SYNERGIES." /><MovieWindow clip="battle" zoom={1.16} focus="50% 46%" /><CutFlash from={1.1*fps} /><CutFlash from={9.6*fps} /></AbsoluteFill>;
};

export const Relics = () => {
  const {fps}=useVideoConfig();
  return <AbsoluteFill><Atmosphere /><Header title="Use iconic Relics to power your minions" /><MovieWindow clip="relic" left={530} zoom={1.42} focus="50% 46%" /><Card id="r005" x={115} y={258} width={345} delay={0.1} /><CutFlash from={2.4*fps} /><CutFlash from={6*fps} /></AbsoluteFill>;
};

export const Collection = () => <AbsoluteFill><Atmosphere /><Header title="217 CARDS. MIX THEIR UNIVERSES." /><MovieWindow clip="collection" /></AbsoluteFill>;

export const Rewards = () => {
  const frame=useCurrentFrame();const {fps}=useVideoConfig();
  return <AbsoluteFill><Atmosphere intense /><Header title="Conquer Universes. Claim their characters." /><MovieWindow clip="reward" zoom={frame<2*fps?1.12:1} /><CutFlash from={0.8*fps} /><CutFlash from={5.8*fps} /></AbsoluteFill>;
};

export const Powers = () => {
  const {fps}=useVideoConfig();
  return <AbsoluteFill><Atmosphere /><Header title="CHOOSE YOUR POWER. CHANGE THE FIGHT." /><MovieWindow clip="powers" zoom={1.15} focus="50% 55%" /><CutFlash from={2*fps} /></AbsoluteFill>;
};
