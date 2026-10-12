import React from 'react';
import {AbsoluteFill,CanvasImage,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Atmosphere,clamp,ease,palette,sans,serif} from './visuals';

export const Opening = () => {
  const frame=useCurrentFrame();const {fps}=useVideoConfig();
  const second=frame>=1.7*fps;
  const wordFrame=second?frame-1.7*fps:frame;
  return <AbsoluteFill style={{overflow:'hidden'}}>
    <Atmosphere intense />
    <div style={{position:'absolute',inset:'70px 140px',display:'flex',gap:28,perspective:1500,opacity:0.52}}>
      <CanvasImage src={staticFile('art/c029.webp')} premountFor={fps} style={{width:'33.33%',height:'100%',objectFit:'cover',borderRadius:16,rotate:'-9deg',translate:`0px ${-30+frame*0.35}px`}} />
      <CanvasImage src={staticFile('art/c044.webp')} premountFor={fps} style={{width:'33.33%',height:'100%',objectFit:'cover',borderRadius:16,translate:`0px ${90-frame*0.65}px`}} />
      <CanvasImage src={staticFile('art/c076.webp')} premountFor={fps} style={{width:'33.33%',height:'100%',objectFit:'cover',borderRadius:16,rotate:'9deg',translate:`0px ${-30+frame*0.35}px`}} />
    </div>
    <AbsoluteFill style={{background:'radial-gradient(ellipse at 50% 50%,#28183888 25%,#281838cc 100%)'}} />
    <div style={{position:'absolute',left:120,right:120,top:390,textAlign:'center',color:palette.ink,
      opacity:interpolate(wordFrame,[0,0.18*fps],[0,1],clamp),scale:interpolate(wordFrame,[0,0.65*fps],[1.15,1],{...clamp,easing:ease})}}>
      <div style={{fontFamily:sans,fontSize:22,letterSpacing:10,fontWeight:900,color:palette.gold,marginBottom:23}}>CONVERGENCE</div>
      <div style={{fontFamily:serif,fontSize:second?150:118,lineHeight:1,fontWeight:700,letterSpacing:second?8:2,textShadow:'0 8px 38px #21172e'}}>{second?'ONE ARENA.':'TWENTY UNIVERSES.'}</div>
      <div style={{margin:'36px auto 0',width:300,height:2,background:`linear-gradient(90deg,transparent,${palette.gold},transparent)`}} />
    </div>
    <AbsoluteFill style={{background:palette.pale,opacity:interpolate(frame,[1.68*fps,1.7*fps,1.85*fps],[0,0.5,0],clamp),mixBlendMode:'screen'}} />
  </AbsoluteFill>;
};
