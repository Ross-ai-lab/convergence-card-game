import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Atmosphere,CutFlash,Header,MovieWindow} from './visuals';

export const Collection = () => <AbsoluteFill><Atmosphere /><Header eyebrow="YOUR COLLECTION. YOUR RULES." title="217 CARDS. MIX THEIR WORLDS." /><MovieWindow clip="collection" start={0.5} rate={1.5} /></AbsoluteFill>;

export const Battle = () => <AbsoluteFill><Atmosphere /><Header eyebrow="THE ARENA" title="FOUR SLOTS. MAKE EVERY MOVE COUNT." /><MovieWindow clip="battle" start={0.2} zoom={1.25} focus="35% 50%" action /><CutFlash from={78} /></AbsoluteFill>;

export const Relics = () => <AbsoluteFill><Atmosphere /><Header eyebrow="CHANGE THE RULES OF THE FIGHT" title="ICONIC RELICS. UNLIKELY COMBOS." /><MovieWindow clip="relic" zoom={1.2} focus="32% 62%" /><CutFlash from={12} /></AbsoluteFill>;

export const Rewards = () => <AbsoluteFill><Atmosphere intense /><Header eyebrow="BUILD YOUR COLLECTION BY WINNING" title="CONQUER WORLDS. CLAIM THEIR CARDS." /><MovieWindow clip="reward" start={9} /><CutFlash from={55} /></AbsoluteFill>;

export const Friends = () => <AbsoluteFill><Atmosphere /><Header eyebrow="LOCAL AND ONLINE DUELS" title="YOUR FRIENDS. YOUR NEXT RIVALS." /><MovieWindow clip="friends" start={0.1} zoom={2} /></AbsoluteFill>;
