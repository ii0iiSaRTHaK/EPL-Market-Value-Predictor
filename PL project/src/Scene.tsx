import { createRoot } from 'react-dom/client';
import { SylvaHero } from '@designcodeio/threeui';
import '@designcodeio/threeui/style.css';

function goTo(id: string, focusSearch = false) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
  if (focusSearch) document.getElementById('player-search')?.focus({ preventScroll: true });
}

function applyPlayerValue(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc || doc.documentElement.dataset.playerValue === 'ready') return;
  doc.documentElement.dataset.playerValue = 'ready';
  doc.title = 'Player Value — See the player. Find the value.';
  const text = (selector: string, value: string) => {
    const element = doc.querySelector(selector);
    if (element) element.textContent = value;
  };
  const lines = doc.querySelectorAll('.headline span i');
  if (lines[0]) lines[0].textContent = 'See the player.';
  if (lines[1]) lines[1].textContent = 'Find the value.';
  text('.lede', 'A new perspective on Premier League talent. Explore season performance and discover the story behind a player’s estimated value.');
  text('.ghost', 'VALUE');
  text('.card--about .label', 'The approach');
  text('.card--about h2', 'Look beyond the fee.');
  text('.card--stove .label', 'The scouting room');
  text('.card--stove h2', 'Your next discovery.');
  text('.stat--a dt', 'Season coverage');
  text('.stat--a dd', '2022/23–2026/27');
  text('.stat--b dt', 'Model output');
  text('.stat--b dd', 'Estimated value, EUR');
  text('.liquid-button--explore .lbl', 'Scout a player');
  const scroll = doc.querySelector('.scroll');
  if (scroll?.firstChild) scroll.firstChild.textContent = 'Start scouting';
  const bind = (selector: string, id: string, label: string, focus = false) => {
    const control = doc.querySelector(selector);
    if (!control) return;
    control.setAttribute('aria-label', label);
    if (control.tagName === 'A') control.setAttribute('href', `/#${id}`);
    control.addEventListener('click', event => { event.preventDefault(); goTo(id, focus); });
  };
  bind('.liquid-button--explore', 'scout', 'Scout a Premier League player', true);
  bind('.liquid-button--play', 'method', 'How player valuations work');
  bind('.knob--about', 'method', 'Read about the valuation model');
  bind('.card--stove .knob', 'scout', 'Open the scouting room', true);
  bind('.scroll', 'scout', 'Start scouting', true);
  const destinations = [
    { label: 'Player Value home', id: 'top' },
    { label: 'Home', id: 'top' },
    { label: 'Scout', id: 'scout' },
    { label: 'Method', id: 'method' },
    { label: 'Find a player', id: 'scout' },
  ];
  doc.querySelectorAll<HTMLAnchorElement>('[data-dock]').forEach((link, index) => {
    const destination = destinations[index];
    if (!destination) return;
    const label = link.querySelector('span:not(.glyph)');
    if (label) label.textContent = destination.label;
    link.setAttribute('aria-label', destination.label);
    link.href = `/#${destination.id}`;
    link.addEventListener('click', event => { event.preventDefault(); goTo(destination.id, destination.id === 'scout'); });
  });
  doc.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault(); goTo('scout', true);
    }
  });
  frame.setAttribute('title', 'Player Value — interactive Living Green hero');
  frame.dataset.integration = 'ready';
  doc.defaultView?.dispatchEvent(new Event('resize'));
}

export function Scene() {
  return (
    <div className="shader-frame">
      <SylvaHero
        variant="living-green"
        headingFont="lexend"
        bodyFont="lexend"
        headingWeight="300"
        bodyWeight="300"
        primaryColor="#ffffff"
        headingSize={63}
        bodySize={16.5}
        headingLetterSpacing={-0.006}
        applyScene={applyPlayerValue}
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  );
}
const root = document.getElementById('sylva-root');
if (root) createRoot(root).render(<Scene />);
