// Fonts the `text` block can use. All are open-licensed (SIL OFL or Apache 2.0)
// and come from @fontsource packages, vendored to vendor/fonts/ by the build.
// The browser loads a font only when a generator uses it.
//
// Onshape only has its own font list, so the FeatureScript draws every font
// with Open Sans, in the weight given by `fsBold`.

// `group` sorts the font picker; FONT_GROUPS gives the order.
export const FONT_GROUPS = ['Sans', 'Rounded', 'Condensed', 'Serif', 'Display', 'Script', 'Monospace', 'Your own'];

export const FONTS = {
  // Sans
  regular: { label: 'Open Sans', pkg: 'open-sans', weight: 400, group: 'Sans' },
  bold: { label: 'Open Sans Bold', pkg: 'open-sans', weight: 700, fsBold: true, group: 'Sans' },
  inter: { label: 'Inter', pkg: 'inter', weight: 400, group: 'Sans' },
  interBold: { label: 'Inter Bold', pkg: 'inter', weight: 700, fsBold: true, group: 'Sans' },
  interBlack: { label: 'Inter Black', pkg: 'inter', weight: 900, fsBold: true, group: 'Sans' },
  montserrat: { label: 'Montserrat Bold', pkg: 'montserrat', weight: 700, fsBold: true, group: 'Sans' },
  poppins: { label: 'Poppins Bold', pkg: 'poppins', weight: 700, fsBold: true, group: 'Sans' },
  lato: { label: 'Lato Black', pkg: 'lato', weight: 900, fsBold: true, group: 'Sans' },
  workSans: { label: 'Work Sans Bold', pkg: 'work-sans', weight: 700, fsBold: true, group: 'Sans' },
  archivoBlack: { label: 'Archivo Black', pkg: 'archivo-black', weight: 400, fsBold: true, group: 'Sans' },
  // Rounded
  rounded: { label: 'Varela Round', pkg: 'varela-round', weight: 400, fsBold: true, group: 'Rounded' },
  nunito: { label: 'Nunito ExtraBold', pkg: 'nunito', weight: 800, fsBold: true, group: 'Rounded' },
  fredoka: { label: 'Fredoka SemiBold', pkg: 'fredoka', weight: 600, fsBold: true, group: 'Rounded' },
  comfortaa: { label: 'Comfortaa Bold', pkg: 'comfortaa', weight: 700, fsBold: true, group: 'Rounded' },
  quicksand: { label: 'Quicksand Bold', pkg: 'quicksand', weight: 700, fsBold: true, group: 'Rounded' },
  // Condensed
  condensed: { label: 'Bebas Neue (capitals)', pkg: 'bebas-neue', weight: 400, fsBold: true, group: 'Condensed' },
  oswald: { label: 'Oswald SemiBold', pkg: 'oswald', weight: 600, fsBold: true, group: 'Condensed' },
  barlowCondensed: { label: 'Barlow Condensed Bold', pkg: 'barlow-condensed', weight: 700, fsBold: true, group: 'Condensed' },
  anton: { label: 'Anton', pkg: 'anton', weight: 400, fsBold: true, group: 'Condensed' },
  // Serif
  slab: { label: 'Roboto Slab Bold', pkg: 'roboto-slab', weight: 700, fsBold: true, group: 'Serif' },
  serif: { label: 'Noto Serif Bold', pkg: 'noto-serif', weight: 700, fsBold: true, group: 'Serif' },
  merriweather: { label: 'Merriweather Black', pkg: 'merriweather', weight: 900, fsBold: true, group: 'Serif' },
  playfair: { label: 'Playfair Display Bold', pkg: 'playfair-display', weight: 700, fsBold: true, group: 'Serif' },
  lora: { label: 'Lora Bold', pkg: 'lora', weight: 700, fsBold: true, group: 'Serif' },
  abrilFatface: { label: 'Abril Fatface', pkg: 'abril-fatface', weight: 400, fsBold: true, group: 'Serif' },
  // Display
  stencil: { label: 'Allerta Stencil', pkg: 'allerta-stencil', weight: 400, group: 'Display' },
  blackOps: { label: 'Black Ops One (stencil)', pkg: 'black-ops-one', weight: 400, fsBold: true, group: 'Display' },
  bungee: { label: 'Bungee', pkg: 'bungee', weight: 400, fsBold: true, group: 'Display' },
  righteous: { label: 'Righteous', pkg: 'righteous', weight: 400, group: 'Display' },
  orbitron: { label: 'Orbitron Bold', pkg: 'orbitron', weight: 700, fsBold: true, group: 'Display' },
  pixel: { label: 'Press Start 2P (pixel)', pkg: 'press-start-2p', weight: 400, group: 'Display' },
  marker: { label: 'Permanent Marker', pkg: 'permanent-marker', weight: 400, group: 'Display' },
  // Script
  script: { label: 'Pacifico', pkg: 'pacifico', weight: 400, group: 'Script' },
  lobster: { label: 'Lobster', pkg: 'lobster', weight: 400, group: 'Script' },
  dancingScript: { label: 'Dancing Script Bold', pkg: 'dancing-script', weight: 700, group: 'Script' },
  kaushan: { label: 'Kaushan Script', pkg: 'kaushan-script', weight: 400, group: 'Script' },
  // Monospace
  mono: { label: 'Roboto Mono Bold', pkg: 'roboto-mono', weight: 700, fsBold: true, group: 'Monospace' },
  jetbrainsMono: { label: 'JetBrains Mono Bold', pkg: 'jetbrains-mono', weight: 700, fsBold: true, group: 'Monospace' },
  spaceMono: { label: 'Space Mono Bold', pkg: 'space-mono', weight: 700, fsBold: true, group: 'Monospace' },
  custom: { label: 'Your own font file', group: 'Your own' },
};

export const FONT_NAMES = Object.keys(FONTS);

/** File name of a bundled font inside its @fontsource package and in vendor/fonts/. */
export const fontFile = (name) => {
  const f = FONTS[name];
  return f?.pkg ? `${f.pkg}-latin-${f.weight}-normal.woff` : null;
};
