const base = `${import.meta.env?.BASE_URL ?? '/'}assets/logos-personalizadas/`;

export const CUSTOM_ASSETS = Object.freeze({
  menuLogo: `${base}logo-menu.png`,
  questionDecoration: `${base}fundo-perguntas.png`,
  questionLogo: `${import.meta.env?.BASE_URL ?? '/'}assets/logos-perguntas/logo-perguntas.png`,
  loadingLogo: `${base}logo-carregamento.png`,
});

const warned = new Set();

// Only insert a successfully loaded image: the original visual remains on failure.
export function mountCustomAsset(host, key, { fallback, alt = '' } = {}) {
  const source = CUSTOM_ASSETS[key];
  if (!source || !host) return;
  const image = host.ownerDocument.createElement('img');
  image.className = `custom-asset custom-asset-${key}`;
  image.alt = alt;
  image.onload = () => {
    host.prepend(image);
    if (fallback) fallback.hidden = true;
  };
  image.onerror = () => {
    image.remove();
    if (fallback) fallback.hidden = false;
    if (!warned.has(source)) {
      warned.add(source);
      console.info(`[Imagens personalizadas] ${source} indisponível. Mantendo o visual padrão.`);
    }
  };
  image.src = source;
}
