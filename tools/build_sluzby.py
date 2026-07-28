#!/usr/bin/env python3
"""
Zamienia surowy wynik parsera na dane gotowe dla programatora.

Odsiewa:
- wiersze naglowkowe tabel (zawieraja granice pasm, nie kanaly)
- strony ze sklejonymi komorkami, z ktorych nie da sie odtworzyc podzialu na miasta
- etykiety, ktore nie sa nazwa miejsca ani numerem kanalu
"""
import json, re

raw = json.load(open('sluzby_raw.json'))

# Granice pasm powtarzane w naglowkach kazdej tabeli - nigdy nie sa kanalem.
BAND_EDGES = {164.525, 168.475, 450.0, 452.975, 460.0, 462.975, 148.6625, 149.3375, 172.0, 174.0}

HEADER_WORDS = ('kanał', 'kanal', 'częstotliwość', 'czestotliwosc', 'mhz', 'uwagi', 'lp.', 'nazwa')

# Strony, ktore parsuja sie czysto - kazdy wiersz to jedno miejsce.
LOCAL = {
    'Policja': 'police',
    'Stra-Poarna': 'fire',
    'Pogotowie': 'ems',
    'Stra-Miejska': 'municipal',
}
# Strony ogolnokrajowe - jeden zestaw dla calego kraju, bez podzialu na miasta.
NATIONAL = {
    'PKP': 'rail',
    'Lasy-Pastwowe': 'forest',
    'VHF-i-UHF-Morskie': 'marine',
    'WOPR-TOPR-GOPR': 'rescue',
    'Stra-graniczna': 'border',
    'Sie-Zarzdzania-Wojewodw': 'crisis',
}
# Pomijane: 'Inne-miasta-Polski' i 'PSP_-BF' maja sklejone komorki - z 6 wierszy
# nie da sie odtworzyc, ktora czestotliwosc nalezy do ktorego miasta.
SKIP = {'Inne-miasta-Polski', 'PSP_-BF'}


def is_header(label: str, freqs: list) -> bool:
    low = label.lower()
    if any(w in low for w in HEADER_WORDS):
        return True
    # Wiersz zlozony wylacznie z granic pasm to opis zakresu, nie kanaly.
    return bool(freqs) and all(f in BAND_EDGES for f in freqs)


def clean_place(label: str) -> str | None:
    """Nazwa miejscowosci albo None, gdy etykieta nie nadaje sie na nazwe."""
    s = re.sub(r'\s+', ' ', label).strip(' -–—:.,')
    if not s or len(s) > 40:
        return None
    if s.isdigit():  # numer kanalu krajowego, nie miejsce
        return None
    if not re.search(r'[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]', s):
        return None
    return s


national = {}
for page, key in NATIONAL.items():
    # WOPR/TOPR/GOPR to jeden zlepiony blok tekstu - nazw stacji nie da sie
    # przypisac do czestotliwosci, wiec bierzemy sama liste bez filtra naglowka.
    rows = raw.get(page, [])
    if key == 'rescue':
        freqs = sorted({f for r in rows for f in r['freqs'] if f not in BAND_EDGES})
    else:
        freqs = sorted({f for r in rows if not is_header(r['label'], r['freqs']) for f in r['freqs']})
    if freqs:
        national[key] = freqs
    print(f'{key:10} krajowe: {len(freqs)} czestotliwosci')

# Kanaly krajowe strazy pozarnej maja etykiety liczbowe - to numeracja B001..B054.
fire_numbered = []
for r in raw.get('Stra-Poarna', []):
    if r['label'].isdigit() and len(r['freqs']) == 1 and r['freqs'][0] not in BAND_EDGES:
        fire_numbered.append({'n': int(r['label']), 'f': r['freqs'][0]})
fire_numbered.sort(key=lambda x: x['n'])
print(f'fire       kanaly numerowane: {len(fire_numbered)}')

places: dict[str, dict[str, list]] = {}
for page, key in LOCAL.items():
    for r in raw.get(page, []):
        if is_header(r['label'], r['freqs']):
            continue
        place = clean_place(r['label'])
        if not place:
            continue
        usable = [f for f in r['freqs'] if f not in BAND_EDGES]
        if not usable:
            continue
        places.setdefault(place, {}).setdefault(key, [])
        for f in usable:
            if f not in places[place][key]:
                places[place][key].append(f)

# Miejsce warte pokazania ma co najmniej jedna sluzbe z czestotliwoscia.
places = {p: v for p, v in places.items() if any(v.values())}
for p in places:
    for k in places[p]:
        places[p][k] = sorted(places[p][k])

print(f'\nmiejscowosci: {len(places)}')
counts = {k: sum(1 for v in places.values() if v.get(k)) for k in LOCAL.values()}
print('pokrycie per sluzba:', counts)

out = {
    'source': 'czestotliwosci.pl.tl',
    'national': national,
    'fireNumbered': fire_numbered,
    'places': places,
}
json.dump(out, open('sluzby_pl.json', 'w'), ensure_ascii=False, separators=(',', ':'))
import os
print(f'\nrozmiar JSON: {os.path.getsize("sluzby_pl.json") / 1024:.1f} kB')
print('przyklady:', list(places.items())[:2])
