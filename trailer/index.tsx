import React from 'react';
import {AbsoluteFill, Composition, Folder, Series, staticFile, registerRoot, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {Opening} from './Opening';
import {Teams} from './Teams';
import {Collection,Battle,Relics,Rewards,Friends} from './Gameplay';
import {Champions} from './Champions';
import {Finale} from './Finale';
import {Border} from './visuals';
import {Poster} from './Poster';

const ConvergenceTrailer = () => {
  const {fps}=useVideoConfig();
  return <AbsoluteFill>
    <Series>
      <Series.Sequence name="Twenty universes. One arena." durationInFrames={3.6*fps} premountFor={fps}><Opening /></Series.Sequence>
      <Series.Sequence name="Impossible crossover teams" durationInFrames={6*fps} premountFor={fps}><Teams /></Series.Sequence>
      <Series.Sequence name="The actual card collection" durationInFrames={5.4*fps} premountFor={fps}><Collection /></Series.Sequence>
      <Series.Sequence name="Summon and attack" durationInFrames={7*fps} premountFor={fps}><Battle /></Series.Sequence>
      <Series.Sequence name="Equip a relic" durationInFrames={4.5*fps} premountFor={fps}><Relics /></Series.Sequence>
      <Series.Sequence name="Victory and the reward reveal" durationInFrames={7*fps} premountFor={fps}><Rewards /></Series.Sequence>
      <Series.Sequence name="Champions across the multiverse" durationInFrames={4*fps} premountFor={fps}><Champions /></Series.Sequence>
      <Series.Sequence name="Play with friends" durationInFrames={3.5*fps} premountFor={fps}><Friends /></Series.Sequence>
      <Series.Sequence name="Final montage and invitation" durationInFrames={7*fps} premountFor={fps}><Finale /></Series.Sequence>
    </Series>
    <Border />
    <Audio name="Trailer soundtrack" src={staticFile('audio/score.wav')} premountFor={fps} volume={1} />
  </AbsoluteFill>;
};

const Root = () => <>
  <Composition id="ConvergenceTrailer" component={ConvergenceTrailer} width={1920} height={1080} fps={30} durationInFrames={1440} />
  <Composition id="TrailerPoster" component={Poster} width={1920} height={1080} fps={30} durationInFrames={120} />
  <Folder name="Scenes">
    <Composition id="Opening" component={Opening} width={1920} height={1080} fps={30} durationInFrames={108} />
    <Composition id="Teams" component={Teams} width={1920} height={1080} fps={30} durationInFrames={180} />
    <Composition id="Collection" component={Collection} width={1920} height={1080} fps={30} durationInFrames={162} />
    <Composition id="Battle" component={Battle} width={1920} height={1080} fps={30} durationInFrames={210} />
    <Composition id="Relics" component={Relics} width={1920} height={1080} fps={30} durationInFrames={135} />
    <Composition id="Rewards" component={Rewards} width={1920} height={1080} fps={30} durationInFrames={210} />
    <Composition id="Champions" component={Champions} width={1920} height={1080} fps={30} durationInFrames={120} />
    <Composition id="Friends" component={Friends} width={1920} height={1080} fps={30} durationInFrames={105} />
    <Composition id="Finale" component={Finale} width={1920} height={1080} fps={30} durationInFrames={210} />
  </Folder>
</>;
registerRoot(Root);
