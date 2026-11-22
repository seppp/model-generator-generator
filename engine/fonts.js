// Fonts the `text` block can use. All are open-licensed (SIL OFL or Apache 2.0)
// and come from @fontsource packages, vendored to vendor/fonts/ by the build.
// The browser loads a font only when a generator uses it.
//
// Onshape only has its own font list, so the FeatureScript draws every font
// with Open Sans, in the weight given by `fsBold`.

export const FONTS = {
  regular: { label: 'Open Sans', pkg: 'open-sans', weight: 400 },
  bold: { label: 'Open Sans Bold', pkg: 'open-sans', weight: 700, fsBold: true },
  rounded: { label: 'Rounded (Varela Round)', pkg: 'varela-round', weight: 400, fsBold: true },
  slab: { label: 'Slab serif (Roboto Slab Bold)', pkg: 'roboto-slab', weight: 700, fsBold: true },
  serif: { label: 'Serif (Noto Serif Bold)', pkg: 'noto-serif', weight: 700, fsBold: true },
  condensed: { label: 'Tall condensed (Bebas Neue, capitals only)', pkg: 'bebas-neue', weight: 400, fsBold: true },
  stencil: { label: 'Stencil (Allerta Stencil)', pkg: 'allerta-stencil', weight: 400 },
  script: { label: 'Script (Pacifico)', pkg: 'pacifico', weight: 400 },
  mono: { label: 'Monospace (Roboto Mono Bold)', pkg: 'roboto-mono', weight: 700, fsBold: true },
  custom: { label: 'Your own font file (this browser only)' },
};

export const FONT_NAMES = Object.keys(FONTS);

/** File name of a bundled font inside its @fontsource package and in vendor/fonts/. */
export const fontFile = (name) => {
  const f = FONTS[name];
  return f?.pkg ? `${f.pkg}-latin-${f.weight}-normal.woff` : null;
};
