import React from 'react';
import {AbsoluteFill,useCurrentFrame,useVideoConfig,interpolate} from 'remotion';
import {Atmosphere,Card,Header,clamp,palette,sans} from './visuals';

export const Teams = () => {
  const frame=useCurrentFrame();const {fps}=useVideoConfig();
  return <AbsoluteFill style={{overflow:'hidden'}}>
    <Atmosphere />
    <Header eyebrow="MAKE THE IMPOSSIBLE YOURS" title="BUILD IMPOSSIBLE TEAMS." />
    <Card id="c029" x={282} y={256} width={380} angle={-10} delay={0.12} depth={2} />
    <Card id="c076" x={1229} y={256} width={380} angle={10} delay={0.32} depth={4} />
    <Card id="c044" x={762} y={208} width={396} angle={0} delay={0.22} depth={0} />
    <div style={{position:'absolute',left:130,right:130,bottom:60,display:'flex',justifyContent:'space-around',fontFamily:sans,fontSize:25,fontWeight:900,color:palette.gold,letterSpacing:5,opacity:interpolate(frame,[0.8*fps,1.2*fps],[0,1],clamp)}}>
      <span>STAR WARS</span><span>DRAGON BALL</span><span>GODZILLA</span>
    </div>
  </AbsoluteFill>;
};
