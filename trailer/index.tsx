import React from 'react';
import {AbsoluteFill,Composition,Folder,Series,staticFile,registerRoot,useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {Opening} from './Opening';
import {Collection,Battle,Relics,Rewards,Powers} from './Gameplay';
import {Champions} from './Champions';
import {Montage} from './Montage';
import {Finale} from './Finale';
import {Border} from './visuals';

const ConvergenceTrailer = () => {
  const {fps}=useVideoConfig();
  return <AbsoluteFill><Series>
    <Series.Sequence name="Twenty Universes. One arena." durationInFrames={8*fps} premountFor={fps}><Opening /></Series.Sequence>
    <Series.Sequence name="Cross-Universe combat and synergies" durationInFrames={12*fps} premountFor={fps}><Battle /></Series.Sequence>
    <Series.Sequence name="Infinity Stone empowers Superman" durationInFrames={11*fps} premountFor={fps}><Relics /></Series.Sequence>
    <Series.Sequence name="Build your collection" durationInFrames={12*fps} premountFor={fps}><Collection /></Series.Sequence>
    <Series.Sequence name="Voiced champions and unique powers" durationInFrames={12*fps} premountFor={fps}><Champions /></Series.Sequence>
    <Series.Sequence name="Win and claim new characters" durationInFrames={13*fps} premountFor={fps}><Rewards /></Series.Sequence>
    <Series.Sequence name="Choose your power" durationInFrames={10*fps} premountFor={fps}><Powers /></Series.Sequence>
    <Series.Sequence name="New characters in the final montage" durationInFrames={7*fps} premountFor={fps}><Montage /></Series.Sequence>
    <Series.Sequence name="Convergence" durationInFrames={5*fps} premountFor={fps}><Finale /></Series.Sequence>
  </Series><Border /><Audio name="Character voices, announcer cues and cinematic score" src={staticFile('audio/score.wav')} premountFor={fps} volume={1} /></AbsoluteFill>;
};
const Root = () => <>
  <Composition id="ConvergenceTrailer" component={ConvergenceTrailer} width={1920} height={1080} fps={60} durationInFrames={5400} />
  <Folder name="Scenes">
    <Composition id="Opening" component={Opening} width={1920} height={1080} fps={60} durationInFrames={480} />
    <Composition id="Battle" component={Battle} width={1920} height={1080} fps={60} durationInFrames={720} />
    <Composition id="Relics" component={Relics} width={1920} height={1080} fps={60} durationInFrames={660} />
    <Composition id="Collection" component={Collection} width={1920} height={1080} fps={60} durationInFrames={720} />
    <Composition id="Champions" component={Champions} width={1920} height={1080} fps={60} durationInFrames={720} />
    <Composition id="Rewards" component={Rewards} width={1920} height={1080} fps={60} durationInFrames={780} />
    <Composition id="Powers" component={Powers} width={1920} height={1080} fps={60} durationInFrames={600} />
    <Composition id="Montage" component={Montage} width={1920} height={1080} fps={60} durationInFrames={420} />
    <Composition id="Finale" component={Finale} width={1920} height={1080} fps={60} durationInFrames={300} />
  </Folder>
</>;
registerRoot(Root);
