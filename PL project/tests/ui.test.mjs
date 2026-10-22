import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { transform } from 'esbuild';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const client = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const sourceScene = await readFile(new URL('../public/landing-pages/inner-green-3d.html', import.meta.url), 'utf8');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const response = (data, ok = true) => ({ok, json:async () => data});
const players = [{id:'2025-26:mohamed salah',name:'Mohamed Salah',position:'Midfielder',season:'2025-26'},{id:'2024-25:salah example',name:'Another Salah',position:'Attacker',season:'2024-25'}];
const valuation = {name:'Mohamed Salah',position:'Midfielder',season:'2025-26',predictedValue:0,statsSeasons:'2024-25 and 2025-26',dataSource:'Historical FPL dataset',features:{goals_12m:0,assists_12m:0,minutes_played_12m:0,games_12m:null}};

function setup(route = () => response({players})) {
  const dom = new JSDOM(html, {url:'http://localhost:3001/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  const {window} = dom;
  window.matchMedia = () => ({matches:false});
  window.HTMLElement.prototype.scrollIntoView = function () { window.__lastScroll = this.id; };
  window.fetch = async (url, options) => url === '/api/status' ? response({modelAvailable:true,modelReady:true}) : route(url, options);
  window.eval(client);
  const input = window.document.querySelector('#player-search');
  const enter = value => { input.value = value; input.dispatchEvent(new window.Event('input',{bubbles:true})); };
  const key = value => input.dispatchEvent(new window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
  return {dom,window,input,enter,key,document:window.document};
}

test('short input does not request players and clear returns focus', async () => {
  let requests = 0;
  const app = setup(() => { requests++; return response({players}); });
  try {
    app.enter('Sa'); await pause(340);
    assert.equal(requests,0);
    assert.equal(app.input.getAttribute('aria-expanded'),'false');
    app.document.querySelector('#clear-search').click();
    assert.equal(app.input.value,'');
    assert.equal(app.document.activeElement,app.input);
  } finally { app.dom.window.close(); }
});

test('Escape cancels pending search and late responses cannot reopen it', async () => {
  let resolve;
  const app = setup(() => new Promise(done => {resolve=done;}));
  try {
    app.enter('Salah'); await pause(330);
    app.key('Escape'); resolve(response({players})); await pause(15);
    assert.equal(app.document.querySelector('#search-results').hidden,true);
    assert.equal(app.input.getAttribute('aria-expanded'),'false');
  } finally { app.dom.window.close(); }
});

test('new search wins when an earlier response arrives later', async () => {
  const pending = [];
  const app = setup(() => new Promise(resolve => pending.push(resolve)));
  try {
    app.enter('Salah'); await pause(330);
    app.enter('Saka'); await pause(330);
    pending[1](response({players:[{...players[0],name:'Bukayo Saka'}]})); await pause(15);
    pending[0](response({players})); await pause(15);
    assert.match(app.document.querySelector('#search-results').textContent,/Bukayo Saka/);
    assert.doesNotMatch(app.document.querySelector('#search-results').textContent,/Mohamed Salah/);
  } finally { app.dom.window.close(); }
});

test('keyboard selection calls the existing prediction API and preserves zero vs missing values', async () => {
  const calls = [];
  const app = setup(url => {calls.push(url);return response(url.includes('/prediction')?valuation:{players});});
  try {
    app.enter('Salah'); await pause(330);
    app.key('ArrowDown');
    assert.equal(app.input.getAttribute('aria-activedescendant'),'player-option-0');
    assert.equal(app.document.querySelector('#player-option-0').getAttribute('aria-selected'),'true');
    app.key('Enter'); await pause(20);
    assert.ok(calls.some(url => url === '/api/players/2025-26%3Amohamed%20salah/prediction'));
    assert.equal(app.document.querySelector('.predicted-value').textContent,'€0');
    assert.deepEqual([...app.document.querySelectorAll('.stats-grid dd')].map(el=>el.textContent),['0','0','0','—']);
    assert.equal(app.document.querySelector('#result').getAttribute('aria-busy'),'false');
    app.document.querySelector('[data-dismiss]').click();
    assert.equal(app.document.querySelector('#result').hidden,true);
    assert.equal(app.document.querySelector('#empty-state').hidden,false);
  } finally { app.dom.window.close(); }
});

test('empty and failed searches show useful messages without injecting returned HTML', async () => {
  let fail = false;
  const app = setup(() => fail ? response({error:'<img src=x onerror=alert(1)>'},false) : response({players:[]}));
  try {
    app.enter('Nobody'); await pause(330);
    assert.match(app.document.querySelector('#search-results').textContent,/No players found/);
    fail = true; app.enter('Another'); await pause(330);
    assert.equal(app.document.querySelector('#search-results img'),null);
    assert.match(app.document.querySelector('#search-results').textContent,/<img/);
  } finally { app.dom.window.close(); }
});

test('a failed valuation offers retry and does not display backend configuration details', async () => {
  let attempts = 0;
  const app = setup(url => {
    if (!url.includes('/prediction')) return response({players});
    attempts++;
    return attempts === 1 ? response({error:'No module named sklearn; C:/private/path'},false) : response(valuation);
  });
  try {
    app.enter('Salah'); await pause(330); app.key('Enter'); await pause(20);
    assert.match(app.document.querySelector('#result').textContent,/Try again/);
    assert.doesNotMatch(app.document.querySelector('#result').textContent,/sklearn|private/);
    app.document.querySelector('[data-retry]').click(); await pause(20);
    assert.equal(attempts,2);
    assert.equal(app.document.querySelector('.result-title').textContent,'Mohamed Salah');
  } finally { app.dom.window.close(); }
});

test('suggestion buttons and the global search shortcut reach the real search control', async () => {
  const app = setup();
  try {
    app.document.querySelector('[data-query="Haaland"]').click();
    assert.equal(app.input.value,'Haaland');
    assert.equal(app.document.activeElement,app.input);
    app.input.blur();
    app.document.dispatchEvent(new app.window.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true}));
    assert.equal(app.document.activeElement,app.input);
    assert.equal(app.window.__lastScroll,'scout');
  } finally { app.dom.window.close(); }
});

test('the actual React source component applies configured typography and connects native hero controls', async () => {
  const app = setup();
  try {
    const compiled = await transform(await readFile(new URL('../public/assets/scene.js',import.meta.url),'utf8'),{format:'iife'});
    app.window.eval(compiled.code);
    for (let tries=0;tries<30&&!app.document.querySelector('iframe');tries++) await pause(10);
    const frame = app.document.querySelector('iframe');
    assert.ok(frame);
    assert.equal(frame.getAttribute('src'),'/landing-pages/inner-green-3d.html');
    frame.contentDocument.open(); frame.contentDocument.write(sourceScene); frame.contentDocument.close();
    frame.dispatchEvent(new app.window.Event('load')); await pause(20);
    assert.equal(frame.dataset.integration,'ready');
    assert.equal(frame.contentDocument.querySelector('.headline span i').textContent,'See the player.');
    const typography = frame.contentDocument.querySelector('#threeui-page-typography').textContent;
    assert.match(typography,/font-weight: 300/);
    assert.match(typography,/calc\(63 \* var\(--u\)\)/);
    assert.match(typography,/-0.006em/);
    frame.contentDocument.querySelector('.liquid-button--explore').click();
    assert.equal(app.document.activeElement,app.input);
    assert.equal(app.window.__lastScroll,'scout');
    frame.contentDocument.querySelector('.liquid-button--play').click();
    assert.equal(app.window.__lastScroll,'method');
    assert.equal(frame.contentDocument.querySelectorAll('[data-liquid-metal]').length,2);
    assert.ok(frame.contentDocument.querySelector('canvas#scene'));
  } finally { app.dom.window.close(); }
});
