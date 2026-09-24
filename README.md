# FitAI

Aplicación en español para registrar alimentos y macros, crear rutinas, medir sesiones con temporizador y consultar el progreso por grupo muscular. Los registros personales se guardan en el navegador.

## Publicar gratis en GitHub Pages

1. Descomprime el ZIP y sube el contenido a la raíz del repositorio, de modo que `index.html` quede en la raíz. Mantén las carpetas `data/` y `scripts/` con sus archivos dentro.
2. En GitHub, abre el repositorio y entra en **Settings → Pages**.
3. En **Build and deployment**, elige **Deploy from a branch**.
4. Selecciona la rama `main` y la carpeta `/(root)`, y pulsa **Save**.
5. Cuando GitHub termine la publicación, abre el enlace que aparece en esa misma página.

## Usar el asistente sin pagar una API

1. Abre FitAI y entra en **FitAI**.
2. Escribe una pregunta o pulsa una de las sugerencias.
3. FitAI abre ChatGPT en otra pestaña y copia un mensaje preparado con tu pregunta, tus objetivos, los macros y alimentos registrados hoy y hasta cinco entrenamientos recientes.
4. En ChatGPT, pega el texto con **Ctrl+V** y envíalo.

No se envían datos automáticamente desde FitAI: tú decides pegarlos y mandarlos. ChatGPT tiene una modalidad gratuita, sujeta a límites que pueden cambiar. La API de OpenAI no se usa y no hace falta configurar una clave.

## Pasar tus datos a otro dispositivo

1. En el dispositivo que tiene tus datos, pulsa el icono **⇅** y elige **Descargar copia de seguridad**.
2. Guarda el archivo `fitai-copia-AAAA-MM-DD.json` y pásalo al otro dispositivo por el medio que prefieras.
3. Abre FitAI en el otro dispositivo, pulsa **⇅**, selecciona el archivo y confirma la restauración.

La copia incluye tus objetivos, registros de alimentos, catálogo personal, rutinas, ejercicios y entrenamientos. El archivo contiene datos personales: consérvalo de forma privada. FitAI no lo envía a ningún servidor. Al restaurar, reemplaza los datos locales de ese navegador.

## Probar en tu ordenador

Necesitas Node.js 20 o posterior. Desde la carpeta del proyecto, ejecuta `npm start` y abre `http://localhost:4173`.

## Catálogo de alimentos

data/foods.json incluye 1.000 productos asociados a tiendas españolas (939 asociados a Mercadona y 61 a Carrefour en esta versión), más dos alimentos genéricos de referencia: arroz blanco largo crudo y pechuga de pollo cruda sin piel. Los productos incluyen macros por 100 g y un enlace a su fuente. El importador `scripts/import-foods.mjs` conserva el mínimo de 1.000 productos de supermercado y añade siempre los dos alimentos de referencia.

Los productos de tienda proceden de Open Food Facts, una base de datos colaborativa; no son una exportación ni una verificación oficial de las apps de Mercadona o Carrefour. Contrasta siempre los macros con la etiqueta del envase. Los dos alimentos genéricos enlazan a USDA FoodData Central.

## Funciones

- Objetivos diarios de calorías y macros, registro por comidas y catálogo personal de alimentos o platos, con macros por 100 g o por ración.
- Biblioteca de ejercicios, ejercicios propios con modo habitual bilateral o unilateral y rutinas guardadas.
- Temporizador de entrenamiento con series ajustables, repeticiones, RIR, modo bilateral/unilateral y carga.
- Historial y progreso por grupo muscular.
- Copia de seguridad y restauración de tus datos personales entre dispositivos.
- Resumen de FitAI listo para copiar a ChatGPT.

El asistente ofrece información general y no sustituye a profesionales sanitarios.
