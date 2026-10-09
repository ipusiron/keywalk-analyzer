/* Read validated preferences before CSS to avoid a flash of the other theme. */
(function() {
  'use strict';
  let theme, language;
  try { theme = localStorage.getItem('theme'); language = localStorage.getItem('language'); } catch {}
  const requested = new URLSearchParams(location.search).get('lang');
  if (requested === 'ja' || requested === 'en') language = requested;
  if (language !== 'ja' && language !== 'en') language = navigator.language.startsWith('ja') ? 'ja' : 'en';
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.lang = language;
  document.documentElement.dataset.theme = theme;
})();
