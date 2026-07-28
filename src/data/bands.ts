/**
 * Zestawy czestotliwosci wgrywane do radia.
 *
 * KAZDY zestaw deklaruje, czy wolno na nim nadawac. Kanaly bez prawa nadawania
 * trafiaja do radia z zablokowanym nadajnikiem (txFreq = null), co radio egzekwuje
 * sprzetowo. To nie jest ozdobnik - Baofeng ma moc wielokrotnie wyzsza niz dopuszczalna
 * na PMR446 i LPD433, wiec nadawanie nim na tych kanalach lamie prawo.
 */

import type { Bandwidth, Power } from '../radio/uv5r-memory.ts';

/** Na jakich warunkach zestaw pozwala nadawac. */
export type TxPolicy =
  /** Nadawanie zabronione zawsze - kanaly ida jako wylacznie odbiorcze. */
  | 'receive-only'
  /** Nadawanie dozwolone tylko posiadaczom pozwolenia radiowego. */
  | 'license-required';

export interface PresetChannel {
  name: string;
  /** Czestotliwosc odbioru w Hz. */
  rx: number;
  /** Czestotliwosc nadawania w Hz. Pominieta oznacza prace simpleksowa (tx = rx). */
  tx?: number;
  bandwidth: Bandwidth;
  power: Power;
}

export interface FrequencySet {
  id: string;
  /** Nazwa dla uzytkownika - bez zargonu. */
  label: string;
  /** Jedno zdanie: po co komus ten zestaw. */
  description: string;
  txPolicy: TxPolicy;
  /** Powod ograniczenia, pokazywany przy kafelku. Krotko i konkretnie. */
  legalNote: string;
  channels: PresetChannel[];
}

const MHz = (v: number) => Math.round(v * 1_000_000);

/**
 * PMR446 - 16 kanalow, raster 12,5 kHz.
 * Zrodlo: czestotliwosci.pl.tl. Krance zweryfikowane: kanal 1 = 446,00625, kanal 16 = 446,19375.
 */
export const PMR446: FrequencySet = {
  id: 'pmr446',
  label: 'PMR446 - krótkofalówki bez pozwolenia',
  description: 'Kanały, na których rozmawiają zwykłe krótkofalówki ze sklepu, bez żadnych formalności.',
  txPolicy: 'receive-only',
  legalNote:
    'Na PMR446 wolno nadawać tylko urządzeniem o mocy do 0,5 W z anteną na stałe przymocowaną. ' +
    'Baofeng ma większą moc i odkręcaną antenę, więc te kanały wgrywamy wyłącznie do słuchania.',
  channels: Array.from({ length: 16 }, (_, i) => ({
    name: `PMR ${i + 1}`,
    rx: MHz(446.00625 + i * 0.0125),
    bandwidth: 'narrow' as const,
    power: 'low' as const,
  })),
};

/**
 * LPD433 - 69 kanalow, raster 25 kHz.
 * Zrodlo: czestotliwosci.pl.tl. Krance zweryfikowane: kanal 1 = 433,075, kanal 69 = 434,775.
 */
export const LPD433: FrequencySet = {
  id: 'lpd433',
  label: 'LPD433 - stare krótkofalówki zabawkowe',
  description: 'Kanały używane przez tanie krótkofalówki sprzed lat i część niań elektronicznych.',
  txPolicy: 'receive-only',
  legalNote:
    'LPD433 dopuszcza moc 10 mW. Baofeng nadaje co najmniej 1 W, czyli sto razy więcej, ' +
    'więc te kanały wgrywamy wyłącznie do słuchania.',
  channels: Array.from({ length: 69 }, (_, i) => ({
    name: `LPD ${i + 1}`,
    rx: MHz(433.075 + i * 0.025),
    bandwidth: 'narrow' as const,
    power: 'low' as const,
  })),
};

/**
 * PMR-154 - 4 kanaly VHF, 1 W, wymaga zezwolenia UKE.
 * Zrodlo: czestotliwosci.pl.tl.
 */
export const PMR154: FrequencySet = {
  id: 'pmr154',
  label: 'PMR-154 - łączność firmowa VHF',
  description: 'Cztery kanały używane przez firmy i służby porządkowe po uzyskaniu zezwolenia.',
  txPolicy: 'license-required',
  legalNote: 'Nadawanie na tych kanałach wymaga zezwolenia radiowego z UKE.',
  channels: [154.6, 154.8, 154.825, 154.85].map((f, i) => ({
    name: `PMR15${i + 1}`,
    rx: MHz(f),
    bandwidth: 'narrow' as const,
    power: 'low' as const,
  })),
};

/**
 * Pasmo amatorskie 2 m, czesc simpleksowa FM.
 * Bandplan IARU Region 1: 145,2000-145,5875 MHz, raster 12,5 kHz.
 * 145,500 MHz to kanal wywolawczy FM.
 */
export const HAM_2M: FrequencySet = {
  id: 'ham-2m',
  label: 'Pasmo amatorskie 2 m (145 MHz)',
  description: 'Kanały krótkofalarskie VHF, w tym kanał wywoławczy 145,500 MHz.',
  txPolicy: 'license-required',
  legalNote: 'Nadawanie w paśmie amatorskim wymaga pozwolenia radiowego i znaku wywoławczego.',
  channels: Array.from({ length: 32 }, (_, i) => {
    const freq = 145.2 + i * 0.0125;
    const isCalling = Math.abs(freq - 145.5) < 0.0001;
    return {
      name: isCalling ? 'WYWOL' : `2M ${i + 1}`,
      rx: MHz(freq),
      bandwidth: 'narrow' as const,
      power: 'low' as const,
    };
  }),
};

/**
 * Pasmo amatorskie 70 cm, czesc simpleksowa FM.
 * Bandplan IARU Region 1: 433,4000-433,5750 MHz, raster 12,5 kHz.
 * 433,500 MHz to kanal wywolawczy FM.
 */
export const HAM_70CM: FrequencySet = {
  id: 'ham-70cm',
  label: 'Pasmo amatorskie 70 cm (433 MHz)',
  description: 'Kanały krótkofalarskie UHF, w tym kanał wywoławczy 433,500 MHz.',
  txPolicy: 'license-required',
  legalNote: 'Nadawanie w paśmie amatorskim wymaga pozwolenia radiowego i znaku wywoławczego.',
  channels: Array.from({ length: 15 }, (_, i) => {
    const freq = 433.4 + i * 0.0125;
    const isCalling = Math.abs(freq - 433.5) < 0.0001;
    return {
      name: isCalling ? 'WYWOL' : `70CM ${i + 1}`,
      rx: MHz(freq),
      bandwidth: 'narrow' as const,
      power: 'low' as const,
    };
  }),
};

/**
 * Zestawy gotowe do uzycia.
 *
 * BRAKUJE TU zestawow sluzb (straz pozarna, pogotowie, lotnictwo) i przemiennikow
 * amatorskich per miasto. To dane, ktorych nie wolno zgadywac: kanal obok wlasciwego
 * oznacza radio milczace, a uzytkownik uzna, ze narzedzie nie dziala. Uzupelniamy je
 * dopiero z jednego zweryfikowanego zrodla - patrz plan projektu, sekcja 5.
 */
export const ALL_SETS: FrequencySet[] = [PMR446, LPD433, PMR154, HAM_2M, HAM_70CM];

/** Ile kanalow zajmie wybrany zestaw zestawow. */
export function countChannels(sets: FrequencySet[]): number {
  return sets.reduce((sum, s) => sum + s.channels.length, 0);
}
