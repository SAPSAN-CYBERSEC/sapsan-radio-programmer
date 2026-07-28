/**
 * Polskie sluzby - zestawy budowane z danych `services-pl.json`.
 *
 * Dane pochodza z czestotliwosci.pl.tl i sa wyciagane skryptem `tools/parse_sluzby.py`
 * plus `tools/build_sluzby.py`, nie przepisywane recznie. Zrodlo ma dwie pulapki,
 * ktore skrypty obsluguja: atrybut `num=` w HTML nie odpowiada wyswietlanej wartosci,
 * a wiersze naglowkowe zawieraja granice pasm udajace kanaly.
 */

import type { FrequencySet, PresetChannel } from './bands.ts';
import data from './services-pl.json' with { type: 'json' };

/** Sluzby przypisane do konkretnej miejscowosci. */
export type LocalService = 'police' | 'fire' | 'ems' | 'municipal';
/** Sluzby o zasiegu krajowym. */
export type NationalService = 'rail' | 'forest' | 'marine' | 'rescue' | 'border' | 'crisis';

/** Kolejnosc na liscie - od tego, czego ludzie szukaja najczesciej. */
const LOCAL_ORDER: LocalService[] = ['fire', 'police', 'ems', 'municipal'];
const NATIONAL_ORDER: NationalService[] = ['marine', 'rail', 'border', 'crisis', 'forest', 'rescue'];

const places = data.places as Record<string, Partial<Record<LocalService, number[]>>>;
const national = data.national as Record<string, number[]>;
const fireNumbered = data.fireNumbered as Array<{ n: number; f: number }>;

/** Skroty nazw kanalow - radio pokazuje tylko 7 znakow. */
const SHORT: Record<string, string> = {
  police: 'POL',
  fire: 'PSP',
  ems: 'POG',
  municipal: 'SM',
  rail: 'PKP',
  forest: 'LAS',
  marine: 'MOR',
  rescue: 'GOPR',
  border: 'SG',
  crisis: 'KRYZ',
};

const MHz = (v: number) => Math.round(v * 1_000_000);

function toChannels(freqs: number[], prefix: string): PresetChannel[] {
  return freqs.map((f, i) => ({
    name: `${prefix}${i + 1}`.slice(0, 7),
    rx: MHz(f),
    bandwidth: 'narrow' as const,
    power: 'low' as const,
  }));
}

/** Lista miejscowosci do wyboru. Wojewodztwa (pisane wersalikami) ida na gore. */
export function placeNames(): string[] {
  const all = Object.keys(places);
  const regions = all.filter((p) => p === p.toUpperCase()).sort((a, b) => a.localeCompare(b, 'pl'));
  const cities = all.filter((p) => p !== p.toUpperCase()).sort((a, b) => a.localeCompare(b, 'pl'));
  return [...regions, ...cities];
}

/** Zestawy sluzb dla wybranej miejscowosci. Pusta lista, gdy nic nie wybrano. */
export function localServiceSets(place: string | null): FrequencySet[] {
  if (!place) return [];
  const entry = places[place];
  if (!entry) return [];

  const out: FrequencySet[] = [];
  for (const key of LOCAL_ORDER) {
    const freqs = entry[key];
    if (!freqs?.length) continue;
    out.push({
      id: `svc-${key}`,
      countries: ['PL'],
      i18nKey: `svc_${key}`,
      channels: toChannels(freqs, SHORT[key]!),
    });
  }
  return out;
}

/** Zestawy sluzb o zasiegu krajowym - niezalezne od wyboru miejscowosci. */
export function nationalServiceSets(): FrequencySet[] {
  const out: FrequencySet[] = [];

  // Kanaly krajowe strazy pozarnej maja wlasna numeracje i warto ja zachowac,
  // bo tak sie o nich mowi w eterze.
  if (fireNumbered.length) {
    out.push({
      id: 'svc-fire-nat',
      countries: ['PL'],
      i18nKey: 'svc_fireNat',
      channels: fireNumbered.map((c) => ({
        name: `PSP ${c.n}`.slice(0, 7),
        rx: MHz(c.f),
        bandwidth: 'narrow' as const,
        power: 'low' as const,
      })),
    });
  }

  for (const key of NATIONAL_ORDER) {
    const freqs = national[key];
    if (!freqs?.length) continue;
    out.push({
      id: `svc-${key}`,
      countries: ['PL'],
      i18nKey: `svc_${key}`,
      channels: toChannels(freqs, SHORT[key]!),
    });
  }
  return out;
}

export const SERVICES_SOURCE = data.source as string;
