import { chooseBotAction } from './bot';
import type { BotRequest } from './bot-search';

// The same deterministic search as the simulator, on a separate browser thread.
self.onmessage = ({ data }: MessageEvent<BotRequest>) => {
  const { game, library, player, skill } = data;
  self.postMessage(chooseBotAction(game, library, player, skill));
};
