/**
 * Zamiana wybranych zestawow na liste kanalow gotowa do wpisania w pamiec radia.
 *
 * Tu zapada decyzja, czy dany kanal bedzie mogl nadawac. Cala reszta programu
 * juz tej decyzji nie zmienia - nadawanie wlacza sie wylacznie w tym jednym miejscu.
 */

import type { Channel } from '../radio/uv5r-memory.ts';
import { CHANNEL_COUNT } from '../radio/uv5r-memory.ts';
import type { FrequencySet } from './bands.ts';

export interface BuildOptions {
  /**
   * Uzytkownik oswiadczyl, ze ma pozwolenie radiowe.
   * Bez tego zestawy oznaczone `license-required` tez ida jako wylacznie odbiorcze.
   */
  hasLicense: boolean;
}

export interface BuildResult {
  channels: Channel[];
  /** Kanaly, ktore nie zmiescily sie w pamieci radia. */
  dropped: number;
  /** Ile kanalow ma zablokowane nadawanie. */
  receiveOnly: number;
}

/**
 * Decyduje, czy kanal z danego zestawu moze nadawac.
 *
 * `receive-only` nie da sie odblokowac zadna opcja - to zestawy, na ktorych
 * Baofeng lamie limit mocy niezaleznie od tego, kto go trzyma.
 */
function canTransmit(set: FrequencySet, opts: BuildOptions): boolean {
  if (set.txPolicy === 'receive-only') return false;
  return opts.hasLicense;
}

export function buildChannels(sets: FrequencySet[], opts: BuildOptions): BuildResult {
  const channels: Channel[] = [];
  let receiveOnly = 0;

  for (const set of sets) {
    const tx = canTransmit(set, opts);
    for (const src of set.channels) {
      if (channels.length >= CHANNEL_COUNT) break;
      if (!tx) receiveOnly++;
      channels.push({
        rxFreq: src.rx,
        txFreq: tx ? (src.tx ?? src.rx) : null,
        name: src.name,
        bandwidth: src.bandwidth,
        power: src.power,
        scan: true,
      });
    }
  }

  const requested = sets.reduce((sum, s) => sum + s.channels.length, 0);
  return { channels, dropped: Math.max(0, requested - channels.length), receiveOnly };
}
