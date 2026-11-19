# Biblioteca del pati con realidad aumentada

Flujo: QR → la web pide la cámara → la cámara reconoce el dibujo → aparece el armario 3D encima del real y se abren las puertas → se toca un libro → se ve su ficha y su estado → si está libre, se puede escoger (pasa a "pendiente de confirmación").

Tecnología: A-Frame + MindAR (reconocimiento de imagen), Supabase (estados) y GitHub Pages (alojamiento gratis con HTTPS).

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `style.css`, `app.js` | La web y la escena AR (no hace falta tocarlos) |
| `config.js` | **Medidas del armario y del papel, en cm** |
| `books.js` | **Los 10 libros** (título, autor, resumen, color) |
| `supabase-config.js` | **URL y clave pública de tu proyecto Supabase** |
| `data.js` | Conexión con Supabase |
| `targets.mind` | **Lo tenéis que generar vosotros** (paso 1) |

## Probar ya, sin nada preparado

Abre `index.html?demo=1` en el ordenador. Verás el armario 3D con las puertas abriéndose y los 10 libros, sin cámara.

## Pasos para ponerlo en marcha

### 1. El papel (dibujo + QR) y el archivo `targets.mind`
1. Diseñad el papel: el **dibujo** y el **QR** en la misma hoja, con muchos detalles y contrastes.
2. Guardad la hoja **tal como la vais a imprimir** como imagen PNG o JPG.
3. Abrid https://hiukim.github.io/mind-ar-js-doc/tools/compile , subid la imagen, pulsad *Start* y descargad **`targets.mind`**.
4. Poned `targets.mind` en la misma carpeta que `index.html`.

### 2. Supabase (base de datos sin 2FA)
1. Crea una cuenta y un proyecto gratis en https://supabase.com.
2. Entra en **SQL Editor**, pega el bloque SQL de las instrucciones y pulsa **Run** (crea la tabla con los 10 libros en `lliure`).
3. Entra en **Project Settings → API** (o **Data API / API Keys**) y copia la **Project URL** y la clave **`anon` `public`** dentro de `supabase-config.js`.
4. Para confirmar un libro como admin: en Supabase abre **Table Editor → `llibres`** y cambia `estat` de `pendent` a `escollit` (o de vuelta a `lliure`).

### 3. GitHub Pages
1. Crea un repositorio público en GitHub y sube todos los archivos de esta carpeta (incluido `targets.mind`).
2. *Settings → Pages → Branch: main / root → Save*.
3. Usa la URL `https://TU-USUARIO.github.io/NOMBRE-REPO/` para generar el código QR del cartel.
