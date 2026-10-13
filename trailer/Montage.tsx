import React from 'react';
import {AbsoluteFill,CanvasImage,Series,staticFile,useCurrentFrame,useVideoConfig,interpolate} from 'remotion';
import {Atmosphere,clamp,palette,sans} from './visuals';

const Moment = ({id,name}:{id:string;name:string}) => {
  const frame=useCurrentFrame();const {fps}=useVideoConfig();
  return <AbsoluteFill style={{overflow:'hidden'}}>
    <CanvasImage src={staticFile(`art/${id}.webp`)} premountFor={fps} style={{width:'100%',height:'100%',objectFit:'cover',scale:interpolate(frame,[0,3*fps],[1.02,1.1],clamp)}} />
    <AbsoluteFill style={{background:'linear-gradient(0deg,#281637cc,transparent 60%)'}} />
    <div style={{position:'absolute',left:90,right:90,bottom:92,color:palette.ink,fontFamily:sans,fontSize:90,fontWeight:1000}}>{name}</div>
  </AbsoluteFill>;
};
export const Montage = () => {
  const {fps}=useVideoConfig();
  return <AbsoluteFill><Atmosphere intense /><Series>
    <Series.Sequence name="Gojo" durationInFrames={0.8*fps} premountFor={fps}><Moment id="c022" name="Gojo" /></Series.Sequence>
    <Series.Sequence name="Monkey D. Luffy" durationInFrames={0.8*fps} premountFor={fps}><Moment id="c060" name="Monkey D. Luffy" /></Series.Sequence>
    <Series.Sequence name="Vergil, Dante and Nero" durationInFrames={0.8*fps} premountFor={fps}><Moment id="c070" name="Vergil, Dante & Nero" /></Series.Sequence>
    <Series.Sequence name="Naruto" durationInFrames={0.8*fps} premountFor={fps}><Moment id="c183" name="Naruto" /></Series.Sequence>
    <Series.Sequence name="Saitama" durationInFrames={0.8*fps} premountFor={fps}><Moment id="c025" name="Saitama" /></Series.Sequence>
    <Series.Sequence name="Thanos" durationInFrames={3*fps} premountFor={fps}><Moment id="c027" name="Thanos" /></Series.Sequence>
  </Series></AbsoluteFill>;
};
