/**
 * Testy arkusza kanalow.
 *
 * Pilnuja tego, co uzytkownik wpisuje recznie - a wpisuje na rozne sposoby,
 * i kazdy blad tutaj trafia prosto do pamieci radia.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFreq, isInBand } from '../src/ui/sheet.ts';

test('czestotliwosc przyjmuje i kropke, i przecinek', () => {
  // Polak wpisze 145,500, Anglik 145.500 - oba maja znaczyc to samo.
  assert.equal(parseFreq('145.500'), 145_500_000);
  assert.equal(parseFreq('145,500'), 145_500_000);
  assert.equal(parseFreq(' 145,5 '), 145_500_000);
});

test('czestotliwosc jest zaokraglana do rozdzielczosci pamieci radia', () => {
  // Radio trzyma czestotliwosc w jednostkach 10 Hz, wiec drobniejszy zapis
  // i tak nie przetrwa zapisu - lepiej pokazac to od razu.
  assert.equal(parseFreq('446.00625'), 446_006_250);
  assert.equal(parseFreq('145.58753'), 145_587_530);
});

test('bezsensowny wpis jest odrzucany, a nie zamieniany na zero', () => {
  // Zwrocenie 0 przy literach dalo by kanal 0 MHz zamiast komunikatu o bledzie.
  for (const bad of ['', 'abc', '145.5.5', '145,,5', '-145', '1234.5', 'MHz']) {
    assert.equal(parseFreq(bad), null, `"${bad}" powinno byc odrzucone`);
  }
});

test('pasma radia sa rozpoznawane, ale nie blokuja niczego', () => {
  // isInBand tylko informuje - decyzja nalezy do uzytkownika.
  assert.equal(isInBand(145_500_000), true, '2 m');
  assert.equal(isInBand(446_006_250), true, '70 cm');
  assert.equal(isInBand(148_912_500), true, 'sluzby VHF');
  assert.equal(isInBand(27_185_000), false, 'CB - poza pasmem UV-5R');
  assert.equal(isInBand(880_000_000), false, 'GSM - poza pasmem');
  // Krance pasm wg specyfikacji rodziny UV-5R.
  assert.equal(isInBand(136_000_000), true);
  assert.equal(isInBand(135_999_990), false);
  assert.equal(isInBand(520_000_000), true);
  assert.equal(isInBand(520_000_010), false);
});
