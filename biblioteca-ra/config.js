// =====================================================================
//  CONFIGURACIÓ — TOT EN CENTÍMETRES
//  Model basat en l'armari metàl·lic del pati (marc crema, portes marrons,
//  prestatges gris-blavós, 5 forats). Ajusteu les mesures amb una cinta mètrica.
// =====================================================================
window.CONFIG = {
  // Fitxer del dibuix + QR compilat (el genera l'eina de MindAR, veure README)
  targetFile: './targets.mind',

  // El paper (dibuix + QR junts al mateix full) enganxat a dalt de la PORTA ESQUERRA
  // a l'alçada dels ulls (~150 cm des de terra).
  sheet: {
    widthCm: 21,         // AMPLADA del paper imprès (A4 vertical = 21 cm)
    fromLeftCm: 27,      // des de la vora ESQUERRA de l'armari fins al CENTRE del paper
    fromBottomCm: 150    // des de la BASE de l'armari fins al CENTRE del paper (alçada dels ulls)
  },

  cabinet: {
    widthCm: 100,
    heightCm: 180,
    depthCm: 40,
    wallCm: 1.5,                                  // gruix de les xapes
    frame: { sideCm: 4, topCm: 6, bottomCm: 5 },  // marc crema de davant
    shelvesFromBottomCm: [24, 72, 107, 144],      // alçada de cada prestatge (4 prestatges = 5 forats)
    shelfThicknessCm: 2,

    // Llibres per forat, de DALT a BAIX (suma = 10)
    booksPerRow: [2, 2, 2, 2, 2],
    bookMaxWidthCm: 20,
    bookMaxHeightCm: 28,
    bookInsetCm: 8,                               // quant entren els llibres cap al fons

    colors: {
      body:   '#cfc6a7',   // marc i costats (crema envellit)
      inside: '#b9b197',   // fons interior ombrívol
      shelf:  '#a6b3bc',   // prestatges (gris-blavós metàl·lic)
      door:   '#6d5d51',   // portes (marró-grisenc metàl·lic)
      handle: '#d4d8dc'    // nanses, frontisses i baldó (cromat)
    }
  },

  doorOpenDeg: 110       // quant s'obren les portes
};
