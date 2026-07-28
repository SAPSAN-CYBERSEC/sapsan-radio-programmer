#!/usr/bin/env python3
"""
Parser tabel czestotliwosci z czestotliwosci.pl.tl.

Uwaga na dwie pulapki tego zrodla:
1. Atrybut num="..." w <td> NIE odpowiada wyswietlanej wartosci - to smiec po eksporcie
   z Excela. Czytamy wylacznie widoczny tekst.
2. Jedna komorka miewa kilka czestotliwosci rozdzielonych <br>, a nazwa miasta
   potrafi miec czestotliwosc wplecona w tekst.
"""
import re, html, json, sys, os

# Baofeng UV-5R obsluguje te dwa zakresy. Reszta trafien to szum (daty, numery, ceny).
VHF = (136.0, 174.0)
UHF = (400.0, 520.0)

def strip_tags(s: str) -> str:
    s = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', s, flags=re.S | re.I)
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.I)
    s = re.sub(r'</(p|div|tr|li)>', '\n', s, flags=re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = html.unescape(s)
    return re.sub(r'[ \t\xa0]+', ' ', s).strip()

def freqs_in(text: str):
    """Zwraca czestotliwosci w MHz mieszczace sie w pasmach radia."""
    out = []
    for m in re.finditer(r'\b(\d{3})[.,](\d{3,4})\b', text):
        val = float(f'{m.group(1)}.{m.group(2)}')
        if VHF[0] <= val <= VHF[1] or UHF[0] <= val <= UHF[1]:
            out.append(round(val, 4))
    return out

def parse(path: str):
    raw = open(path, encoding='utf-8', errors='replace').read()
    rows = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', raw, flags=re.S | re.I):
        cells = [strip_tags(td) for td in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', tr, flags=re.S | re.I)]
        if not cells:
            continue
        # Etykieta to pierwsza komorka bez czestotliwosci; jesli takiej nie ma,
        # bierzemy pierwsza komorke i czyscimy z liczb.
        label = ''
        for c in cells:
            if c and not freqs_in(c):
                label = c
                break
        if not label and cells:
            label = re.sub(r'\d{3}[.,]\d{3,4}', '', cells[0])
        label = re.sub(r'\s+', ' ', label).strip(' -–—:')

        found = []
        for c in cells:
            found += freqs_in(c)
        if found:
            rows.append({'label': label, 'freqs': sorted(set(found))})
    return rows

if __name__ == '__main__':
    result = {}
    for fn in sorted(os.listdir('sluzby')):
        if not fn.endswith('.html'):
            continue
        rows = parse(os.path.join('sluzby', fn))
        total = sum(len(r['freqs']) for r in rows)
        uniq = sorted({f for r in rows for f in r['freqs']})
        result[fn[:-5]] = rows
        print(f'{fn[:-5]:28} wierszy={len(rows):4}  czestotliwosci={total:4}  unikalnych={len(uniq):4}'
              f'  zakres={min(uniq) if uniq else "-"}..{max(uniq) if uniq else "-"}')
    json.dump(result, open('sluzby_raw.json', 'w'), ensure_ascii=False, indent=1)
