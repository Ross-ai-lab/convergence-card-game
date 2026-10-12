import React from 'react';
import {AbsoluteFill,CanvasImage,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Atmosphere,clamp,ease,palette,sans} from './visuals';

export const Champions = () => {
  const frame=useCurrentFrame();const {fps}=useVideoConfig();
  return <AbsoluteFill style={{overflow:'hidden'}}>
    <Atmosphere intense />
    <div style={{position:'absolute',left:90,top:310,width:1000,color:palette.ink,fontFamily:sans}}>
      <div style={{fontSize:24,color:palette.gold,letterSpacing:6,fontWeight:900,marginBottom:20}}>EVERY WORLD HAS A CHAMPION.</div>
      <div style={{fontSize:90,lineHeight:1.02,fontWeight:1000,letterSpacing:-3,whiteSpace:'nowrap'}}>TWENTY CHAMPIONS.<br /><span style={{color:palette.gold}}>CLAIM THEIR WORLDS.</span></div>
      <div style={{fontSize:35,fontWeight:800,marginTop:30,color:'#e2d3ec'}}>Unique powers. Voiced rivals.</div>
    </div>
    <div style={{position:'absolute',left:1170,top:110,width:620,height:850,overflow:'hidden',borderRadius:'130px 16px 130px 16px',border:`2px solid ${palette.gold}88`,rotate:'4deg',scale:interpolate(frame,[0,0.65*fps],[0.85,1],{...clamp,easing:ease})}}>
      <CanvasImage src={staticFile(frame<fps?'art/c029.webp':frame<2*fps?'art/c104.webp':frame<3*fps?'art/c110.webp':'art/c025.webp')} premountFor={fps} style={{width:'100%',height:'100%',objectFit:'cover',scale:1.08}} />
      <div style={{position:'absolute',inset:0,background:'linear-gradient(0deg,#2a1c3daa,transparent 40%)'}} />
    </div>
  </AbsoluteFill>;
};
