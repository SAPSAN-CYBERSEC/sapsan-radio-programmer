/**
 * Wojewodztwa - jawna lista zamiast zgadywania po wielkosci liter.
 *
 * Zrodlo (czestotliwosci.pl.tl) pisze wojewodztwa wersalikami, ale tym samym
 * krojem zapisuje tez wpisy, ktore wojewodztwami nie sa (CNBOP, OGOLNOPOLSKI),
 * a dwa z nich nazywa na dwa sposoby naraz. Heurystyka "wersaliki = wojewodztwo"
 * wpuszczala te smieci na gore listy i pokazywala jedno wojewodztwo dwa razy.
 *
 * `keys` to dokladne klucze ze zrodla - nie zmieniamy ich, bo po nich lecy
 * odczyt czestotliwosci. Zmienia sie tylko to, co widzi uzytkownik.
 */

import type { Lang } from '../i18n/index.ts';

export interface Region {
  /** Klucze w `services-pl.json`. Wiecej niz jeden, gdy zrodlo pisze nazwe na dwa sposoby. */
  keys: string[];
  names: Record<Lang, string>;
}

export const REGIONS: Region[] = [
  { keys: ['DOLNOŚLĄSKIE'], names: { pl: 'Dolnośląskie', en: 'Lower Silesian', de: 'Niederschlesien', cs: 'Dolnoslezské' } },
  { keys: ['KUJAWSKO-POMORSKIE', 'KUJAWSKO - POMORSKIE'], names: { pl: 'Kujawsko-pomorskie', en: 'Kuyavian-Pomeranian', de: 'Kujawien-Pommern', cs: 'Kujavsko-pomořské' } },
  { keys: ['LUBELSKIE'], names: { pl: 'Lubelskie', en: 'Lublin', de: 'Lublin', cs: 'Lublinské' } },
  { keys: ['LUBUSKIE'], names: { pl: 'Lubuskie', en: 'Lubusz', de: 'Lebus', cs: 'Lubušské' } },
  { keys: ['ŁÓDZKIE'], names: { pl: 'Łódzkie', en: 'Łódź', de: 'Łódź', cs: 'Lodžské' } },
  { keys: ['MAŁOPOLSKIE'], names: { pl: 'Małopolskie', en: 'Lesser Poland', de: 'Kleinpolen', cs: 'Malopolské' } },
  { keys: ['MAZOWIECKIE'], names: { pl: 'Mazowieckie', en: 'Masovian', de: 'Masowien', cs: 'Mazovské' } },
  { keys: ['OPOLSKIE'], names: { pl: 'Opolskie', en: 'Opole', de: 'Oppeln', cs: 'Opolské' } },
  { keys: ['PODKARPACKIE'], names: { pl: 'Podkarpackie', en: 'Subcarpathian', de: 'Karpatenvorland', cs: 'Podkarpatské' } },
  { keys: ['PODLASKIE'], names: { pl: 'Podlaskie', en: 'Podlaskie', de: 'Podlachien', cs: 'Podleské' } },
  { keys: ['POMORSKIE'], names: { pl: 'Pomorskie', en: 'Pomeranian', de: 'Pommern', cs: 'Pomořské' } },
  { keys: ['ŚLĄSKIE'], names: { pl: 'Śląskie', en: 'Silesian', de: 'Schlesien', cs: 'Slezské' } },
  { keys: ['ŚWIĘTOKRZYSKIE'], names: { pl: 'Świętokrzyskie', en: 'Holy Cross', de: 'Heiligkreuz', cs: 'Svatokřížské' } },
  { keys: ['WARMIŃSKO-MAZURSKIE'], names: { pl: 'Warmińsko-mazurskie', en: 'Warmian-Masurian', de: 'Ermland-Masuren', cs: 'Varmijsko-mazurské' } },
  { keys: ['WIELKOPOLSKIE'], names: { pl: 'Wielkopolskie', en: 'Greater Poland', de: 'Großpolen', cs: 'Velkopolské' } },
  { keys: ['ZACHODNIO - POMORSKIE'], names: { pl: 'Zachodniopomorskie', en: 'West Pomeranian', de: 'Westpommern', cs: 'Západopomořanské' } },
];

/** Klucz ze zrodla -> wojewodztwo, do ktorego nalezy. */
const BY_KEY = new Map<string, Region>();
for (const r of REGIONS) for (const k of r.keys) BY_KEY.set(k, r);

export function regionForKey(key: string): Region | undefined {
  return BY_KEY.get(key);
}
