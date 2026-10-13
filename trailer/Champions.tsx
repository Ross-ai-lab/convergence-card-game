import React from 'react';
import {AbsoluteFill,Series,useVideoConfig} from 'remotion';
import {Atmosphere,Card,Header,palette,sans} from './visuals';

const Rival = ({id,name,power}:{id:string;name:string;power:string}) => {
  return <AbsoluteFill>
    <Card id={id} x={1215} y={243} width={475} angle={3} delay={0.05} />
    <div style={{position:'absolute',left:100,top:370,width:990,fontFamily:sans,color:palette.ink}}>
      <div style={{fontSize:89,fontWeight:1000,lineHeight:1.08}}>{name}</div>
      <div style={{fontSize:49,fontWeight:800,lineHeight:1.18,marginTop:32}}>{power}</div>
    </div>
  </AbsoluteFill>;
};
export const Champions = () => {
  const {fps}=useVideoConfig();
  return <AbsoluteFill><Atmosphere intense /><Header title="TWENTY CHAMPIONS. UNIQUE POWERS." />
    <Series>
      <Series.Sequence name="Meruem — Royal Appraisal" durationInFrames={6*fps} premountFor={fps}><Rival id="c084" name="Meruem" power="Royal Appraisal: Discover a card." /></Series.Sequence>
      <Series.Sequence name="Lord Voldemort — Dark Immortality" durationInFrames={6*fps} premountFor={fps}><Rival id="c114" name="Lord Voldemort" power="Dark Immortality: Destroy his minions to defeat him." /></Series.Sequence>
    </Series>
  </AbsoluteFill>;
};
