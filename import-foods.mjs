import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://world.openfoodfacts.org/api/v2/search';
const FIELDS = [
  'code', 'product_name', 'product_name_es', 'brands', 'categories', 'quantity',
  'nutriments', 'nutrition_data', 'nutrition_data_per', 'stores', 'stores_tags', 'countries_tags',
  'image_front_small_url'
].join(',');
const USER_AGENT = 'FitAI/1.0 (https://github.com/2009jorge02-sketch/FitAI; food catalog import)';
const wanted = Number(process.env.FITAI_FOOD_COUNT || 1000);
const maxPages = Number(process.env.FITAI_MAX_PAGES || 10);
const checkpointPath = path.join(ROOT, 'data', 'foods.partial.json');
const STORE_NAMES = {
  mercadona: 'Mercadona', carrefour: 'Carrefour', lidl: 'Lidl', dia: 'DIA',
  alcampo: 'Alcampo', eroski: 'Eroski', spar: 'SPAR', hiperdino: 'HiperDino'
};
const REFERENCE_FOODS = [
  {
    id: 'usda-169756', name: 'Arroz blanco largo crudo', brand: '', category: 'Cereales y derivados', quantity: '100 g',
    kcal: 365, protein: 7.13, carbs: 79.95, fat: 0.66, fiber: 1.3, stores: 'Alimento genérico',
    source: 'USDA FoodData Central (SR Legacy)', url: 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/169756/nutrients'
  },
  {
    id: 'usda-171077', name: 'Pechuga de pollo cruda sin piel', brand: '', category: 'Carnes y aves', quantity: '100 g',
    kcal: 120, protein: 22.5, carbs: 0, fat: 2.62, fiber: 0, stores: 'Alimento genérico',
    source: 'USDA FoodData Central (SR Legacy)', url: 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/171077/nutrients'
  }
];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hasStore(product, store) {
  const stores = String(product.stores || '').toLowerCase();
  const tags = Array.isArray(product.stores_tags) ? product.stores_tags.join(' ').toLowerCase() : '';
  return stores.includes(store) || tags.includes(store);
}

function hasSpanishMarket(product) {
  const tags = Array.isArray(product.countries_tags) ? product.countries_tags.join(' ').toLowerCase() : '';
  return tags.includes('spain') || tags.includes('españa') || tags.includes('espana');
}

function numeric(nutriments, key) {
  const value = nutriments && nutriments[key + '_100g'];
  return value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

function toFood(product, store) {
  const n = product.nutriments || {};
  const name = String(product.product_name_es || product.product_name || '').trim();
  const kcal = numeric(n, 'energy-kcal');
  const protein = numeric(n, 'proteins');
  const carbs = numeric(n, 'carbohydrates');
  const fat = numeric(n, 'fat');
  if (!name || !product.code || [kcal, protein, carbs, fat].some((v) => v == null)) return null;
  return {
    id: String(product.code),
    name,
    brand: String(product.brands || '').split(',')[0].trim(),
    category: String(product.categories || '').split(',').slice(0, 2).join(',').trim() || 'Alimento',
    quantity: String(product.quantity || ''),
    kcal: Math.round(kcal * 10) / 10,
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    fiber: numeric(n, 'fiber'),
    stores: STORE_NAMES[store] || store,
    source: 'Open Food Facts',
    url: 'https://world.openfoodfacts.org/product/' + encodeURIComponent(product.code)
  };
}

async function fetchPage(page, store) {
  const url = new URL(API);
  url.searchParams.set('stores_tags_en', store);
  url.searchParams.set('countries_tags_en', 'spain');
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('sort_by', 'popularity_key');
  url.searchParams.set('page_size', '100');
  url.searchParams.set('page', String(page));

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error('Open Food Facts API respondió ' + response.status);
      const body = await response.json();
      if (!Array.isArray(body.products)) throw new Error('La respuesta no contiene una lista de productos.');
      return body.products;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await wait(5000 * attempt);
    }
  }
  throw lastError;
}

const byCode = new Map();
let startPage = 1;
let startStoreIndex = 0;
try {
  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  if (Array.isArray(checkpoint.foods)) {
    checkpoint.foods.forEach((food) => byCode.set(food.id, food));
    startPage = Number(checkpoint.nextPage) || 1;
    startStoreIndex = Number(checkpoint.nextStoreIndex) || 0;
  }
} catch { /* first import or no previous checkpoint */ }

const stores = ['mercadona', 'carrefour', 'lidl', 'dia', 'alcampo', 'eroski', 'spar', 'hiperdino'];
for (let storeIndex = startStoreIndex; storeIndex < stores.length && byCode.size < wanted; storeIndex += 1) {
  const store = stores[storeIndex];
  const firstPage = storeIndex === startStoreIndex ? startPage : 1;
  for (let page = firstPage; page <= maxPages && byCode.size < wanted; page += 1) {
    let products;
    try { products = await fetchPage(page, store); }
    catch (error) {
      console.log('Pausa en ' + (STORE_NAMES[store] || store) + ' página ' + page + ': ' + error.message);
      break;
    }
    for (const product of products) {
      if (!hasStore(product, store) || !hasSpanishMarket(product)) continue;
      const food = toFood(product, store);
      if (food) byCode.set(food.id, food);
    }
    console.log((STORE_NAMES[store] || store) + ' · página ' + page + ': ' + byCode.size + ' productos con macros completos.');
    await mkdir(path.join(ROOT, 'data'), { recursive: true });
    await writeFile(checkpointPath, JSON.stringify({ nextStoreIndex: storeIndex, nextPage: page + 1, foods: Array.from(byCode.values()) }, null, 2) + '\n', 'utf8');
    if (byCode.size < wanted) await wait(5000);
  }
  startPage = 1;
}

if (byCode.size < wanted) {
  throw new Error('Se han encontrado ' + byCode.size + ' productos válidos; se necesitan ' + wanted + '. No se ha sustituido el catálogo.');
}

const foods = Array.from(byCode.values()).slice(0, wanted).concat(REFERENCE_FOODS);
await mkdir(path.join(ROOT, 'data'), { recursive: true });
await writeFile(path.join(ROOT, 'data', 'foods.json'), JSON.stringify(foods, null, 2) + '\n', 'utf8');
await unlink(checkpointPath).catch(() => {});
console.log('Guardados ' + (foods.length - REFERENCE_FOODS.length) + ' productos de tiendas y ' + REFERENCE_FOODS.length + ' alimentos de referencia en data/foods.json.');
