/**
 * Zestawy czestotliwosci wgrywane do radia, pogrupowane wedlug kraju.
 *
 * Uzytkownik wybiera kraj, dostaje zestawy uzywane w tym kraju. Nic nie jest blokowane
 * ani ukrywane - jedna informacja o odpowiedzialnosci za zgodnosc z lokalnymi przepisami
 * stoi na stronie glownej i to wystarczy.
 */

import type { Bandwidth, Power } from '../radio/uv5r-memory.ts';

export type Country = 'PL' | 'DE' | 'CZ' | 'US';

export const COUNTRIES: Array<{ code: Country; flag: string }> = [
  { code: 'US', flag: '🇺🇸' },
  { code: 'PL', flag: '🇵🇱' },
  { code: 'DE', flag: '🇩🇪' },
  { code: 'CZ', flag: '🇨🇿' },
];

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
  /** Kraje, w ktorych ten zestaw sie pokazuje. */
  countries: Country[];
  /** Klucz tlumaczenia nazwy i opisu - patrz `src/i18n`. */
  i18nKey: string;
  channels: PresetChannel[];
}

const MHz = (v: number) => Math.round(v * 1_000_000);

/**
 * Skrot na kanal simpleksowy waskopasmowy - tak wyglada wiekszosc wpisow.
 * Moc domyslnie pelna: uzytkownik obniza ja swiadomie w arkuszu, a nie odkrywa
 * po fakcie, ze radio nadaje slabiej, niz moglo.
 */
const ch = (name: string, freq: number, bandwidth: Bandwidth = 'narrow'): PresetChannel => ({
  name,
  rx: MHz(freq),
  bandwidth,
  power: 'high',
});

/**
 * PMR446 - 16 kanalow, raster 12,5 kHz. Wspolne dla calej Unii.
 * Zrodlo: czestotliwosci.pl.tl. Krance: kanal 1 = 446,00625, kanal 16 = 446,19375.
 */
export const PMR446: FrequencySet = {
  id: 'pmr446',
  countries: ['PL', 'DE', 'CZ'],
  i18nKey: 'pmr446',
  channels: Array.from({ length: 16 }, (_, i) => ch(`PMR ${i + 1}`, 446.00625 + i * 0.0125)),
};

/**
 * LPD433 - 69 kanalow, raster 25 kHz. Wspolne dla Unii.
 * Zrodlo: czestotliwosci.pl.tl. Krance: kanal 1 = 433,075, kanal 69 = 434,775.
 */
export const LPD433: FrequencySet = {
  id: 'lpd433',
  countries: ['PL', 'DE', 'CZ'],
  i18nKey: 'lpd433',
  channels: Array.from({ length: 69 }, (_, i) => ch(`LPD ${i + 1}`, 433.075 + i * 0.025)),
};

/**
 * PMR-154 - 4 kanaly VHF. Polski przydzial.
 * Zrodlo: czestotliwosci.pl.tl.
 */
export const PMR154: FrequencySet = {
  id: 'pmr154',
  countries: ['PL'],
  i18nKey: 'pmr154',
  channels: [154.6, 154.8, 154.825, 154.85].map((f, i) => ch(`PMR15${i + 1}`, f)),
};

/**
 * Freenet - niemiecki przydzial VHF, 6 kanalow, raster 12,5 kHz.
 * Zrodlo: BNetzA / Wikipedia. Trzy kanaly pierwotne, trzy dolozone w styczniu 2007.
 */
export const FREENET: FrequencySet = {
  id: 'freenet',
  countries: ['DE'],
  i18nKey: 'freenet',
  channels: [149.025, 149.0375, 149.05, 149.0875, 149.1, 149.1125].map((f, i) =>
    ch(`FREE ${i + 1}`, f),
  ),
};

/**
 * FRS/GMRS - amerykanskie 22 kanaly.
 * Zrodlo: RadioReference / FCC. Kanaly 1-7 od 462,5625; 8-14 od 467,5625; 15-22 od 462,5500.
 */
export const FRS_GMRS: FrequencySet = {
  id: 'frs-gmrs',
  countries: ['US'],
  i18nKey: 'frsGmrs',
  channels: [
    ...Array.from({ length: 7 }, (_, i) => ch(`FRS ${i + 1}`, 462.5625 + i * 0.025)),
    ...Array.from({ length: 7 }, (_, i) => ch(`FRS ${i + 8}`, 467.5625 + i * 0.025)),
    ...Array.from({ length: 8 }, (_, i) => ch(`GMRS${i + 15}`, 462.55 + i * 0.025, 'wide')),
  ],
};

/**
 * MURS - amerykanskie 5 kanalow VHF.
 * Zrodlo: FCC. Kanaly 4 i 5 znane jako "Blue Dot" i "Green Dot".
 */
export const MURS: FrequencySet = {
  id: 'murs',
  countries: ['US'],
  i18nKey: 'murs',
  channels: [151.82, 151.88, 151.94, 154.57, 154.6].map((f, i) => ch(`MURS ${i + 1}`, f)),
};

/**
 * Pasmo amatorskie 2 m, czesc simpleksowa FM, bandplan IARU Region 1 (Europa).
 * 145,2000-145,5875 MHz, raster 12,5 kHz. 145,500 to kanal wywolawczy.
 */
export const HAM_2M_EU: FrequencySet = {
  id: 'ham-2m-eu',
  countries: ['PL', 'DE', 'CZ'],
  i18nKey: 'ham2mEu',
  channels: Array.from({ length: 32 }, (_, i) => {
    const freq = 145.2 + i * 0.0125;
    return ch(Math.abs(freq - 145.5) < 0.0001 ? 'CALL 2M' : `2M ${i + 1}`, freq);
  }),
};

/**
 * Pasmo amatorskie 70 cm, czesc simpleksowa FM, bandplan IARU Region 1 (Europa).
 * 433,4000-433,5750 MHz, raster 12,5 kHz. 433,500 to kanal wywolawczy.
 */
export const HAM_70CM_EU: FrequencySet = {
  id: 'ham-70cm-eu',
  countries: ['PL', 'DE', 'CZ'],
  i18nKey: 'ham70cmEu',
  channels: Array.from({ length: 15 }, (_, i) => {
    const freq = 433.4 + i * 0.0125;
    return ch(Math.abs(freq - 433.5) < 0.0001 ? 'CALL 70' : `70CM ${i + 1}`, freq);
  }),
};

/**
 * Pasmo amatorskie 2 m w USA - czesc simpleksowa, bandplan ARRL.
 * 146,400-146,580 MHz, raster 20 kHz. 146,520 to krajowy kanal wywolawczy FM.
 */
export const HAM_2M_US: FrequencySet = {
  id: 'ham-2m-us',
  countries: ['US'],
  i18nKey: 'ham2mUs',
  channels: Array.from({ length: 10 }, (_, i) => {
    const freq = 146.4 + i * 0.02;
    return ch(Math.abs(freq - 146.52) < 0.0001 ? 'CALL 2M' : `2M ${i + 1}`, freq, 'wide');
  }),
};

/**
 * Pasmo amatorskie 70 cm w USA - czesc simpleksowa, bandplan ARRL.
 * 446,000-446,175 MHz, raster 12,5 kHz. 446,000 to krajowy kanal wywolawczy FM.
 */
export const HAM_70CM_US: FrequencySet = {
  id: 'ham-70cm-us',
  countries: ['US'],
  i18nKey: 'ham70cmUs',
  channels: Array.from({ length: 15 }, (_, i) => {
    const freq = 446.0 + i * 0.0125;
    return ch(i === 0 ? 'CALL 70' : `70CM ${i + 1}`, freq, 'wide');
  }),
};

const ALL: FrequencySet[] = [
  PMR446,
  LPD433,
  PMR154,
  FREENET,
  FRS_GMRS,
  MURS,
  HAM_2M_EU,
  HAM_70CM_EU,
  HAM_2M_US,
  HAM_70CM_US,
];

/** Zestawy dostepne w danym kraju. */
export function setsForCountry(country: Country): FrequencySet[] {
  return ALL.filter((s) => s.countries.includes(country));
}

/** Ile kanalow zajmie wybor. */
export function countChannels(sets: FrequencySet[]): number {
  return sets.reduce((sum, s) => sum + s.channels.length, 0);
}
