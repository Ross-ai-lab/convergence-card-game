import React from 'react';
import {AbsoluteFill,CanvasImage,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Atmosphere,clamp,ease,palette,sans,serif} from './visuals';

export const Finale = () => {
  const frame=useCurrentFrame();const {fps}=useVideoConfig();
  const heroes=['c089','c022','c016','c060','c029','c044'];
  const montage=frame<3*fps;
  const close=frame-3*fps;
  return <AbsoluteFill style={{overflow:'hidden'}}>
    <Atmosphere intense />
    {montage?<>
      <CanvasImage src={staticFile(`art/${heroes[Math.min(5,Math.floor(frame/(0.5*fps)))]}.webp`)} premountFor={fps} style={{position:'absolute',left:210,top:-210,width:1500,height:1500,objectFit:'cover',scale:interpolate(frame%(0.5*fps),[0,0.5*fps],[1,1.09],{...clamp,easing:ease})}} />
      <AbsoluteFill style={{background:'linear-gradient(0deg,#2b1b3daa,transparent 75%)'}} />
      <div style={{position:'absolute',left:80,right:80,bottom:90,textAlign:'center',fontFamily:sans,fontSize:91,fontWeight:1000,color:palette.ink,letterSpacing:3}}>YOUR DECK. YOUR MULTIVERSE.</div>
    </>:<>
      <div style={{position:'absolute',left:120,right:120,top:314,textAlign:'center',color:palette.ink,
        scale:interpolate(close,[0,0.55*fps],[1.17,1],{...clamp,easing:ease}),opacity:interpolate(close,[0,0.18*fps],[0,1],clamp)}}>
        <div style={{fontFamily:serif,fontSize:139,lineHeight:1,fontWeight:700,letterSpacing:5,color:palette.pale,textShadow:'0 0 46px #e9b95644'}}>CONVERGENCE</div>
        <div style={{fontFamily:sans,fontSize:29,letterSpacing:9,fontWeight:900,marginTop:29,color:palette.gold}}>TWENTY UNIVERSES. ONE ARENA.</div>
        <div style={{margin:'45px auto',width:430,height:2,background:`linear-gradient(90deg,transparent,${palette.gold},transparent)`}} />
        <div style={{fontFamily:sans,fontSize:48,fontWeight:900}}>Play free in your browser.</div>
        <div style={{fontFamily:sans,fontSize:26,fontWeight:800,letterSpacing:3,color:'#d8c8e9',marginTop:20}}>NO ACCOUNT. NO INSTALL.</div>
        <div style={{fontFamily:sans,fontSize:32,fontWeight:800,color:palette.gold,marginTop:39}}>ross-ai-lab.github.io/convergence-card-game</div>
      </div>
      <AbsoluteFill style={{background:palette.pale,opacity:interpolate(close,[0,1,11],[0,0.48,0],clamp),mixBlendMode:'screen'}} />
    </>}
  </AbsoluteFill>;
};
