import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Atmosphere,Card,palette,sans,serif} from './visuals';

export const Poster = () => <AbsoluteFill style={{overflow:'hidden'}}>
  <Atmosphere />
  <div style={{position:'absolute',left:80,right:80,top:50,textAlign:'center',color:palette.pale,fontFamily:serif,fontSize:133,fontWeight:700,letterSpacing:5}}>CONVERGENCE</div>
  <div style={{position:'absolute',left:80,right:80,top:206,textAlign:'center',color:palette.gold,fontFamily:sans,fontSize:25,fontWeight:900,letterSpacing:9}}>TWENTY UNIVERSES. ONE ARENA.</div>
  <Card id="c029" x={282} y={325} width={360} angle={-10} />
  <Card id="c076" x={1255} y={325} width={360} angle={10} />
  <Card id="c044" x={762} y={285} width={396} />
  <div style={{position:'absolute',left:90,right:90,bottom:74,textAlign:'center',fontFamily:sans,fontSize:58,fontWeight:1000,color:palette.ink}}>BUILD IMPOSSIBLE TEAMS.</div>
</AbsoluteFill>;
