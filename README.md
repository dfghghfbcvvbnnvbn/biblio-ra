# Biblioteca en Realidad Aumentada (RA) — Patio del Instituto

Aplicación web de **Realidad Aumentada (RA)** que funciona directamente desde el navegador del móvil, sin tener que instalar nada. El proyecto convierte un armario metálico real del patio del instituto en una biblioteca interactiva en 3D. Al escanear un código QR y apuntar con la cámara al dibujo del cartel, los alumnos ven aparecer el armario en 3D, sus puertas se abren y muestran **10 libros** en las baldas para consultar sus datos y pedirlos en tiempo real.

---

## Características principales

- **Sin instalación:** se abre directamente desde un código QR en una web alojada en **GitHub Pages** con **HTTPS** (obligatorio para poder usar la cámara en el móvil).
- **Reconocimiento de imagen:** detecta el dibujo impreso del cartel mediante **MindAR** usando el archivo `targets.mind`.
- **Escena 3D interactiva:** creada con **A-Frame**, muestra un armario con dos puertas que se abren, cuatro estantes, texturas y 10 libros con sus portadas.
- **Actualización en tiempo real:** usa **Supabase** para guardar el estado de cada libro (`lliure`, `pendent`, `escollit`), evitar que dos personas pidan el mismo libro a la vez y mostrar los cambios al instante en todos los móviles.
- **Modo de pruebas (`?demo=1`):** permite probar la escena 3D en el ordenador sin cámara, moviéndose con las teclas `WASD` y subiendo o bajando con `E` y `Q` para revisar todas las baldas y libros.

---

## Cómo funciona

1. **Escaneo del QR:** el alumno escanea el código QR del cartel pegado en el armario del patio y abre la web en el móvil.
2. **Detección del cartel:** la web pide permiso para usar la cámara y **MindAR** reconoce el dibujo del cartel gracias a `targets.mind`.
3. **Armario 3D y apertura de puertas:** al detectar el dibujo, el armario 3D aparece encima del armario real y abre sus puertas para mostrar los 10 libros.
4. **Elección de libro:** al tocar un libro, se muestra su información y, si está libre (`lliure`), se puede solicitar.
5. **Cambio de estado en tiempo real:** al pedir un libro `lliure`, pasa de forma segura a `pendent` y todos los dispositivos conectados ven el cambio al momento. La confirmación final (pasar a `escollit` o devolver a `lliure`) se hace desde el panel de la base de datos.

---

## Tecnologías utilizadas

| Parte | Herramienta | Para qué se usa |
| :--- | :--- | :--- |
| **3D y Realidad Aumentada** | **A-Frame**, **MindAR** | Crear la escena 3D, animar puertas y libros, y detectar el dibujo del cartel (`targets.mind`). |
| **Base de datos** | **Supabase** | Guardar los estados en la tabla `llibres`, aplicar reglas de seguridad y actualizar cambios al instante (elegido para evitar el requisito de 2FA de Firebase). |
| **Alojamiento web** | **GitHub Pages** | Publicar los archivos de la web con conexión segura (HTTPS). |
| **Pruebas en ordenador** | Parámetro `?demo=1` | Moverse libremente por la escena (`WASD`, `E`/`Q`) sin necesitar cámara ni cartel físico. |

---

## Archivos del proyecto

```text
├── index.html          # Página principal con la escena de RA y 3D
├── app.js            # Funcionamiento de la RA, toque de libros y tiempo real
├── style.css         # Diseño visual de la interfaz
├── config.js         # Medidas del armario en centímetros, baldas y posición del cartel
├── books.js          # Configuración de los 10 libros
├── data.js           # Datos de cada libro
├── supabase-config.js# Conexión con Supabase
├── targets.mind      # Archivo del dibujo preparado para MindAR
└── covers/           # Imágenes de las portadas de los 10 libros
