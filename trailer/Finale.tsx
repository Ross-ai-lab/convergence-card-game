import React from 'react';
import {AbsoluteFill,interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import {Atmosphere,clamp,ease,palette,sans,serif} from './visuals';

export const Finale = () => {
  const frame=useCurrentFrame();const {fps}=useVideoConfig();
  return <AbsoluteFill><Atmosphere intense />
    <div style={{position:'absolute',left:110,right:110,top:383,textAlign:'center',color:palette.ink,scale:interpolate(frame,[0,0.55*fps],[1.13,1],{...clamp,easing:ease}),opacity:interpolate(frame,[0,0.16*fps],[0,1],clamp)}}>
      <div style={{fontFamily:serif,fontSize:145,lineHeight:1,fontWeight:700,letterSpacing:5,textShadow:'0 0 46px #e9b95633'}}>CONVERGENCE</div>
      <div style={{margin:'46px auto',width:420,height:2,background:`linear-gradient(90deg,transparent,${palette.gold},transparent)`}} />
      <div style={{fontFamily:sans,fontSize:63,fontWeight:900}}>Your deck. Your Universes.</div>
    </div>
    <AbsoluteFill style={{pointerEvents:'none',background:palette.pale,opacity:interpolate(frame,[0,1,0.2*fps],[0,0.36,0],clamp),mixBlendMode:'screen'}} />
  </AbsoluteFill>;
};
