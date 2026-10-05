import { chooseBotAction } from './bot';
import type { BotWorkerRequest } from './bot-search';
import type {CardLibrary} from './game';
let library:CardLibrary | null = null;

// The same deterministic search as the simulator, on a separate browser thread.
self.onmessage = ({ data }: MessageEvent<BotWorkerRequest>) => {
  if(data.library)library=data.library;
  const { game, player, skill } = data;
  if(!library)throw new Error("Bot worker has no card library");
  self.postMessage(chooseBotAction(game, library, player, skill));
};
