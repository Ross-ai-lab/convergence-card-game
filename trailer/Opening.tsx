import React from 'react';
import {AbsoluteFill,interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import {Atmosphere,Card,Header,clamp,palette} from './visuals';

export const Opening = () => {
  const frame=useCurrentFrame();const {fps}=useVideoConfig();
  return <AbsoluteFill style={{overflow:'hidden'}}>
    <Atmosphere intense />
    <Header title="TWENTY UNIVERSES. ONE ARENA." />
    <Card id="c029" x={177} y={286} width={440} angle={-7} delay={0.1} />
    <Card id="c044" x={740} y={249} width={440} delay={0.42} />
    <Card id="c076" x={1303} y={286} width={440} angle={7} delay={0.72} />
    <AbsoluteFill style={{pointerEvents:'none',background:palette.pale,opacity:interpolate(frame,[1.68*fps,1.7*fps,1.9*fps],[0,0.3,0],clamp),mixBlendMode:'screen'}} />
  </AbsoluteFill>;
};
