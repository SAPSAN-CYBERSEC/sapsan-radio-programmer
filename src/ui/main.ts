/**
 * Sterowanie kreatorem. Trzy ekrany, jedna decyzja na ekran.
 *
 * Zestawy filtrujemy po wybranym kraju, ale niczego nie blokujemy - informacja
 * o zgodnosci z lokalnymi przepisami stoi raz, na gorze strony.
 */

import { setsForCountry, countChannels, COUNTRIES, type Country, type FrequencySet } from '../data/bands.ts';
import { buildChannels } from '../data/build-channels.ts';
import { writeChannelsIntoImage, CHANNEL_COUNT } from '../radio/uv5r-memory.ts';
import { identify, readMainMemory, writeChannels, RadioError } from '../radio/uv5r-protocol.ts';
import { WebSerialTransport, isWebSerialSupported } from '../radio/web-serial.ts';
import { t, DEFAULT_LANG, LANGS, type Lang } from '../i18n/index.ts';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Brak elementu #${id} w dokumencie`);
  return el as T;
};

let lang: Lang = DEFAULT_LANG;
let country: Country = 'US';
let transport: WebSerialTransport | null = null;
/** Obraz pamieci odczytany z radia. Modyfikujemy kopie, oryginal zostaje na kopie zapasowa. */
let radioImage: Uint8Array | null = null;
let backupDone = false;
const selected = new Set<string>();

const tr = () => t(lang);

function showError(err: unknown): void {
  const box = $('error');
  box.textContent =
    err instanceof RadioError ? `${err.message}${err.hint ? `. ${err.hint}` : ''}` : tr().errGeneric;
  box.hidden = false;
}

function show(stepId: string): void {
  for (const id of ['step-connect', 'step-choose', 'step-write', 'step-done']) {
    $(id).hidden = id !== stepId;
  }
}

/** Przepisuje wszystkie napisy na aktualny jezyk. */
function applyTexts(): void {
  const d = tr();
  document.documentElement.lang = lang;
  document.title = d.title;

  const map: Record<string, string> = {
    't-title': d.title,
    't-subtitle': d.subtitle,
    't-legal': d.legal,
    't-language': d.language,
    't-country': d.country,
    't-step1': d.step1,
    't-hint1': d.connectHint1,
    't-hint2': d.connectHint2,
    't-hint3': d.connectHint3,
    'btn-connect': d.connect,
    'browser-warning': d.browserWarning,
    't-step2': d.step2,
    't-choose-lead': d.chooseLead,
    'btn-next': d.next,
    't-step3': d.step3,
    't-backup-lead': d.backupLead,
    'btn-backup': d.makeBackup,
    'btn-write': d.write,
    't-dont-unplug': d.dontUnplug,
    't-done-title': d.doneTitle,
    'btn-restart': d.again,
  };
  for (const [id, text] of Object.entries(map)) $(id).textContent = text;

  const countrySel = $<HTMLSelectElement>('country');
  countrySel.innerHTML = COUNTRIES.map(
    (c) => `<option value="${c.code}">${c.flag} ${d.countries[c.code]}</option>`,
  ).join('');
  countrySel.value = country;

  renderSets();
}

/** Rysuje kafelki zestawow dostepnych w wybranym kraju. */
function renderSets(): void {
  const d = tr();
  const box = $('sets');
  const available = setsForCountry(country);

  // Wybor, ktory nie istnieje w nowym kraju, przestaje obowiazywac.
  for (const id of [...selected]) {
    if (!available.some((s) => s.id === id)) selected.delete(id);
  }

  box.innerHTML = '';
  for (const set of available) {
    const text = d.sets[set.i18nKey];
    const label = document.createElement('label');
    label.className = 'set';
    label.innerHTML = `
      <input type="checkbox" value="${set.id}" ${selected.has(set.id) ? 'checked' : ''} />
      <span>
        <span class="set-label">${text?.label ?? set.id}</span>
        <p class="set-desc">${text?.desc ?? ''}</p>
        <span class="count">${set.channels.length}</span>
      </span>`;
    const input = label.querySelector('input')!;
    input.addEventListener('change', () => {
      if (input.checked) selected.add(set.id);
      else selected.delete(set.id);
      updateCounter();
    });
    box.appendChild(label);
  }
  updateCounter();
}

function chosenSets(): FrequencySet[] {
  return setsForCountry(country).filter((s) => selected.has(s.id));
}

/** Licznik miejsc. Radio ma ich 128 i uzytkownik musi o tym wiedziec przed zapisem. */
function updateCounter(): void {
  const d = tr();
  const total = countChannels(chosenSets());
  const next = $<HTMLButtonElement>('btn-next');

  next.disabled = total === 0;
  $('counter').textContent =
    total === 0
      ? d.nothingSelected
      : total > CHANNEL_COUNT
        ? d.tooMany(total, CHANNEL_COUNT)
        : d.selectedOf(total, CHANNEL_COUNT);
}

function setProgress(done: number, total: number): void {
  $('progress').hidden = false;
  $('bar').style.width = `${Math.round((done / total) * 100)}%`;
}

async function connect(): Promise<void> {
  $('error').hidden = true;
  const btn = $<HTMLButtonElement>('btn-connect');
  btn.disabled = true;
  btn.textContent = tr().connecting;
  try {
    transport = await WebSerialTransport.request();
    await identify(transport);
    radioImage = await readMainMemory(transport, setProgress);
    show('step-choose');
  } catch (err) {
    showError(err);
    await transport?.close().catch(() => {});
    transport = null;
  } finally {
    btn.disabled = false;
    btn.textContent = tr().connect;
  }
}

/**
 * Zapisuje na dysk to, co bylo w radiu przed nasza ingerencja.
 * Bez tego kroku nie odblokowujemy zapisu - to jedyna droga powrotu.
 */
function downloadBackup(): void {
  if (!radioImage) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  // slice() daje wlasny bufor, wiec plik nie zmieni sie, gdy pozniej ruszymy obraz.
  const blob = new Blob([radioImage.slice().buffer as ArrayBuffer], {
    type: 'application/octet-stream',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `radio-backup-${stamp}.img`;
  a.click();
  URL.revokeObjectURL(a.href);

  backupDone = true;
  const status = $('backup-status');
  status.textContent = tr().backupDone;
  status.hidden = false;
  $<HTMLButtonElement>('btn-write').disabled = false;
}

async function writeToRadio(): Promise<void> {
  if (!transport || !radioImage || !backupDone) return;
  $('error').hidden = true;
  const btn = $<HTMLButtonElement>('btn-write');
  btn.disabled = true;
  btn.textContent = tr().writing;

  try {
    const result = buildChannels(chosenSets());

    // Pracujemy na kopii, zeby obraz z radia zostal nietkniety na wypadek ponowienia.
    const image = radioImage.slice();
    writeChannelsIntoImage(image, result.channels);
    await writeChannels(transport, image, setProgress);

    const d = tr();
    const parts = [d.doneText(result.channels.length)];
    if (result.dropped > 0) parts.push(d.doneDropped(result.dropped));
    parts.push(d.doneRestart);
    $('done-text').textContent = parts.join(' ');
    show('step-done');
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
    btn.textContent = tr().write;
  }
}

function init(): void {
  const langSel = $<HTMLSelectElement>('lang');
  langSel.innerHTML = LANGS.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');
  langSel.value = lang;
  langSel.addEventListener('change', () => {
    lang = langSel.value as Lang;
    applyTexts();
  });

  $<HTMLSelectElement>('country').addEventListener('change', (e) => {
    country = (e.target as HTMLSelectElement).value as Country;
    renderSets();
  });

  applyTexts();

  if (!isWebSerialSupported()) {
    $('browser-warning').hidden = false;
    $<HTMLButtonElement>('btn-connect').disabled = true;
    return;
  }

  $('btn-connect').addEventListener('click', connect);
  $('btn-next').addEventListener('click', () => show('step-write'));
  $('btn-backup').addEventListener('click', downloadBackup);
  $('btn-write').addEventListener('click', writeToRadio);
  $('btn-restart').addEventListener('click', () => show('step-choose'));
}

init();
