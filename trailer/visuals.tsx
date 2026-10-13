import React from 'react';
import {AbsoluteFill, CanvasImage, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';
import {loadFont} from '@remotion/fonts';
import cast from './cast.json';

loadFont({family:'Convergence Sans',url:staticFile('Nunito.woff2'),weight:'200 1000'});
export const palette = {ink:'#fff3da',gold:'#f0c767',pale:'#ffdf9a',purple:'#ad78f6',teal:'#55dccc',bg:'#251837'};
export const sans = 'Convergence Sans, Arial, sans-serif';
export const serif = 'Georgia, Times New Roman, serif';
export const ease = Easing.bezier(0.16,1,0.3,1);
export const clamp = {extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
const stars = Array.from({length:90},(_,i)=>({x:(i*113.71+49)%1920,y:(i*87.31+121)%1080,r:i%8===0?2:0.8,phase:i*1.13}));

export const Atmosphere = ({intense=false}:{intense?:boolean}) => {
  const frame=useCurrentFrame(); const {fps}=useVideoConfig(); const t=frame/fps;
  return <AbsoluteFill style={{background:palette.bg,overflow:'hidden'}}>
    <AbsoluteFill style={{background:'radial-gradient(ellipse at 50% 40%, #61316b88, transparent 65%), radial-gradient(ellipse at 90% 80%, #28557180, transparent 60%), linear-gradient(125deg,#342044,#251837 70%,#2c233b)'}} />
    <svg width="1920" height="1080" style={{position:'absolute',opacity:0.65}}>
      {stars.map((star,i)=><circle key={i} cx={star.x} cy={(star.y-t*(intense?16:6)+1080*20)%1080} r={star.r} fill={i%4===0?palette.gold:palette.ink} opacity={0.35+0.3*Math.sin(star.phase+t)} />)}
    </svg>
    <div style={{position:'absolute',left:555,top:135,width:810,height:810,border:`2px solid ${palette.gold}55`,borderRadius:'50%',rotate:`${t*4}deg`,boxShadow:'0 0 100px #bd71ec35,inset 0 0 85px #bd71ec28'}}>
      <div style={{position:'absolute',inset:24,border:`1px solid ${palette.gold}33`,borderRadius:'50%'}} />
      <div style={{position:'absolute',inset:100,border:'1px solid #e5c58335',rotate:'45deg'}} />
      {[0,60,120,180,240,300].map(angle=><div key={angle} style={{position:'absolute',left:390,top:-12,width:26,height:26,background:'#805555',border:`2px solid ${palette.gold}`,rotate:`${angle+45}deg`,transformOrigin:'13px 417px'}} />)}
    </div>
    <AbsoluteFill style={{background:'linear-gradient(90deg,#28163750,transparent 28%,transparent 72%,#28163750)'}} />
  </AbsoluteFill>;
};

export const Header = ({title}:{title:string}) => {
  const f=useCurrentFrame();const {fps}=useVideoConfig();
  return <div style={{position:'absolute',left:80,right:80,top:43,color:palette.ink,fontFamily:sans,translate:interpolate(f,[0,0.38*fps],['0px 28px','0px 0px'],{...clamp,easing:ease}),opacity:interpolate(f,[0,0.2*fps],[0,1],clamp)}}>
    <div style={{fontSize:67,fontWeight:1000,lineHeight:1.03,letterSpacing:-1.2}}>{title}</div>
  </div>;
};

export const Card = ({id,x,y,width=360,angle=0,delay=0,depth=0}:{id:string;x:number;y:number;width?:number;angle?:number;delay?:number;depth?:number}) => {
  const frame=useCurrentFrame();const {fps}=useVideoConfig();const card=cast.find(card=>card.id===id)!;
  return <div style={{position:'absolute',left:x,top:y,width,perspective:1800,
    opacity:interpolate(frame,[delay*fps,(delay+0.3)*fps],[0,1],clamp),
    translate:interpolate(frame,[delay*fps,(delay+0.8)*fps],[`0px ${190+depth}px`,'0px 0px'],{...clamp,easing:ease}),
    scale:interpolate(frame,[delay*fps,(delay+0.75)*fps],[0.72,1],{...clamp,easing:ease}),
    rotate:`${angle+Math.sin(frame/fps*0.8+depth)*0.6}deg`,
    filter:'drop-shadow(0 25px 25px #21172e99)'}}>
    <CanvasImage src={staticFile(card.face)} premountFor={fps} style={{width:'100%',height:'auto',display:'block',borderRadius:11}} />
    <div style={{position:'absolute',inset:0,borderRadius:11,border:'1px solid #fff1c440',pointerEvents:'none'}} />
  </div>;
};

export const MovieWindow = ({clip,start=0,rate=1,zoom=1,focus='50% 50%',action=false,left=60}:{clip:string;start?:number;rate?:number;zoom?:number;focus?:string;action?:boolean;left?:number}) => {
  const frame=useCurrentFrame();const {fps}=useVideoConfig();
  return <div style={{position:'absolute',left,right:60,top:136,bottom:40,overflow:'hidden',border:`1px solid ${palette.gold}55`,borderRadius:17,background:'#30223b',boxShadow:'0 18px 65px #21172e66',
    scale:interpolate(frame,[0,0.8*fps],[0.985,1],{...clamp,easing:ease})}}>
    <div style={{position:'absolute',inset:0,transformOrigin:focus,scale:action?interpolate(frame,[0,2*fps,3*fps,4.2*fps,6.1*fps],[1,1,zoom,zoom,1],{...clamp,easing:ease}):interpolate(frame,[0,0.9*fps],[zoom*0.98,zoom],{...clamp,easing:ease})}}>
      <Video name={clip} src={staticFile(`clips/${clip}.mp4`)} premountFor={fps} trimBefore={start*fps} playbackRate={rate} objectFit="contain" muted style={{width:'100%',height:'100%'}} />
    </div>
  </div>;
};

export const CutFlash = ({from=0,color=palette.gold}:{from?:number;color?:string}) => {
  const frame=useCurrentFrame();
  return <AbsoluteFill style={{pointerEvents:'none',background:color,opacity:interpolate(frame,[from,from+2,from+9],[0,0.35,0],clamp),mixBlendMode:'screen'}} />;
};

export const Border = () => <AbsoluteFill style={{pointerEvents:'none',border:'16px solid #2b1c3d',boxShadow:`inset 0 0 0 1px ${palette.gold}33`}} />;
