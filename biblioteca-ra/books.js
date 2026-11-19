// =====================================================================
//  ELS 10 LLIBRES
//  - id:       NO el canvieu (és el que es guarda a Firebase).
//  - titol:    títol complet (surt a la fitxa).
//  - curt:     títol curt, per a la portada en 3D quan encara no hi ha imatge.
//  - portada:  imatge de la portada. Poseu el fitxer a la carpeta covers/ amb aquest nom.
//  - resum:    el de la contraportada (els que diuen "Afegiu..." falten).
//  - color:    color de les tapes i el llom del llibre en 3D.
// =====================================================================
window.BOOKS = [
  { id: 'l01', titol: 'Cómo sobrevivir en un mundo sobremedicado: Busca la evidencia por ti mismo',
    curt: 'Mundo sobremedicado', autor: 'Peter C. Gøtzsche', editorial: 'Roca Editorial',
    portada: 'covers/l01.jpg', color: '#f5f4ef',
    resum: "El metge Peter C. Gøtzsche explica com es pot arribar a sobremedicar la població i dona eines per buscar i valorar per un mateix l'evidència científica abans de prendre decisions sobre la pròpia salut." },

  { id: 'l02', titol: 'Hablemos de sexo sin pelos en la lengua',
    curt: 'Hablemos de sexo', autor: 'Maite Simeón Faura', editorial: 'Llibres Parcir',
    portada: 'covers/l02.jpg', color: '#8a2b3d',
    resum: "Afegiu aquí el resum de la contraportada." },

  { id: 'l03', titol: 'Mi padre me vendió por una deuda de juego',
    curt: 'Mi padre me vendió', autor: 'KettyAna Rivas', editorial: 'Llibres Parcir',
    portada: 'covers/l03.jpg', color: '#8a2b3d',
    resum: "Afegiu aquí el resum de la contraportada." },

  { id: 'l04', titol: 'Fruits Basket Another, Vol. 1',
    curt: 'Fruits Basket Another', autor: 'Natsuki Takaya', editorial: 'Norma Editorial',
    portada: 'covers/l04.jpg', color: '#cfd4d9',
    resum: "Manga que continua l'univers de Fruits Basket amb una nova generació de personatges." },

  { id: 'l05', titol: '¡Pechos fuera!',
    curt: '¡Pechos fuera!', autor: 'Pepe Colubí', editorial: 'Espasa',
    portada: 'covers/l05.jpg', color: '#6d1a2b',
    resum: "Afegiu aquí el resum de la contraportada." },

  { id: 'l06', titol: 'Tots els detectius es diuen Flanagan',
    curt: 'Tots els detectius es diuen Flanagan', autor: 'Andreu Martín i Jaume Ribera', editorial: 'Columna Jove',
    portada: 'covers/l06.jpg', color: '#9bcda8',
    resum: "Novel·la juvenil de misteri amb el jove detectiu Flanagan com a protagonista." },

  { id: 'l07', titol: 'Odessa i el món secret dels llibres',
    curt: 'Odessa', autor: 'Peter van Olmen', editorial: '',
    portada: 'covers/l07.jpg', color: '#cfa33a', metallic: true,
    resum: "Afegiu aquí el resum de la contraportada." },

  { id: 'l08', titol: 'Una entrega especial',
    curt: 'Una entrega especial', autor: 'Danielle Steel', editorial: '',
    portada: 'covers/l08.jpg', color: '#d04933',
    resum: "Afegiu aquí el resum de la contraportada." },

  { id: 'l09', titol: 'Maddie: La verdad de la mentira',
    curt: 'Maddie', autor: 'Gonçalo Amaral', editorial: 'Esquilo',
    portada: 'covers/l09.jpg', color: '#d6c78a',
    resum: "L'inspector Gonçalo Amaral, que va dirigir la investigació inicial de la desaparició de Madeleine McCann, hi explica la seva versió dels fets." },

  { id: 'l10', titol: 'Clásicos para contar',
    curt: 'Clásicos para contar', autor: '', editorial: '',
    portada: 'covers/l10.jpg', color: '#e8a8b8',
    resum: "Afegiu aquí el resum de la contraportada." }
];
