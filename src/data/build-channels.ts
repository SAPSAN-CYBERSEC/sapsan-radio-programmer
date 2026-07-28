/**
 * Zamiana wybranych zestawow na liste kanalow gotowa do wpisania w pamiec radia.
 */

import type { Channel } from '../radio/uv5r-memory.ts';
import { CHANNEL_COUNT } from '../radio/uv5r-memory.ts';
import type { FrequencySet } from './bands.ts';

export interface BuildResult {
  channels: Channel[];
  /** Kanaly, ktore nie zmiescily sie w pamieci radia. */
  dropped: number;
}

export function buildChannels(sets: FrequencySet[]): BuildResult {
  const channels: Channel[] = [];

  for (const set of sets) {
    for (const src of set.channels) {
      if (channels.length >= CHANNEL_COUNT) break;
      channels.push({
        rxFreq: src.rx,
        txFreq: src.tx ?? src.rx,
        name: src.name,
        bandwidth: src.bandwidth,
        power: src.power,
        scan: true,
      });
    }
  }

  const requested = sets.reduce((sum, s) => sum + s.channels.length, 0);
  return { channels, dropped: Math.max(0, requested - channels.length) };
}
