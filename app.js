(function () {
  'use strict';

  var STORE_KEY = 'fitai-state-v1';
  var MEALS = [
    { id: 'Desayuno', icon: '☀', hint: 'Empieza con energía' },
    { id: 'Comida', icon: '◒', hint: 'Tu comida principal' },
    { id: 'Merienda', icon: '◌', hint: 'Un descanso nutritivo' },
    { id: 'Cena', icon: '☾', hint: 'Cierra el día' }
  ];
  var MUSCLE_GROUPS = ['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Bíceps', 'Tríceps', 'Core', 'Glúteos'];
  var TITLES = { dashboard: 'Inicio', nutrition: 'Alimentación', training: 'Entrenamiento', progress: 'Progreso', assistant: 'FitAI Coach' };
  var emptyState = {
    goals: { calories: 2200, protein: 145, carbs: 240, fat: 70 },
    log: [], routines: [], workouts: [], customFoods: [], customExercises: [], activeWorkout: null, chat: []
  };
  var state = readState();
  var foods = [];
  var exercises = [];
  var currentPage = 'dashboard';
  var foodDraft = { query: '', selected: null, meal: 'Desayuno', tab: 'catalog' };
  var routineDraft = { name: '', exercises: [], query: '' };
  var exerciseQuery = '';
  var timerInterval = null;

  function readState() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return Object.assign({}, emptyState, saved, {
        goals: Object.assign({}, emptyState.goals, saved.goals || {}),
        log: Array.isArray(saved.log) ? saved.log : [],
        routines: Array.isArray(saved.routines) ? saved.routines : [],
        workouts: Array.isArray(saved.workouts) ? saved.workouts : [],
        customFoods: Array.isArray(saved.customFoods) ? saved.customFoods : [],
        customExercises: Array.isArray(saved.customExercises) ? saved.customExercises : [],
        chat: Array.isArray(saved.chat) ? saved.chat : []
      });
    } catch (error) { return JSON.parse(JSON.stringify(emptyState)); }
  }
  function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function round(value, digits) { var factor = Math.pow(10, digits == null ? 0 : digits); return Math.round(num(value) * factor) / factor; }
  function format(value) { return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(round(value, 1)); }
  function dateKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function shortDate(value) {
    var d = new Date(value);
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(d);
  }
  function todayLog() { return state.log.filter(function (item) { return item.date === dateKey(); }); }
  function totalMacros(entries) {
    return entries.reduce(function (a, item) {
      a.kcal += num(item.kcal); a.protein += num(item.protein); a.carbs += num(item.carbs); a.fat += num(item.fat);
      return a;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  }
  function allFoods() { return foods.concat(state.customFoods); }
  function findFood(key) { return allFoods().find(function (food) { return String(food.id) === String(key); }); }
  function allExercises() { return exercises.concat(state.customExercises); }
  function findExercise(key) { return allExercises().find(function (exercise) { return String(exercise.id) === String(key); }); }
  function toast(message) {
    var root = document.getElementById('toast-root');
    var node = document.createElement('div');
    node.className = 'toast'; node.textContent = message; root.appendChild(node);
    window.setTimeout(function () { node.remove(); }, 2900);
  }
  function loadCatalogs() {
    Promise.all([
      fetchFirstJson(['data/foods.json', 'foods.json']).catch(function () { return []; }),
      fetchFirstJson(['data/exercises.json', 'exercises.json']).catch(function () { return []; })
    ]).then(function (data) {
      foods = (Array.isArray(data[0]) ? data[0] : []).map(normalizeFood).filter(function (f) { return f.name && f.kcal != null; });
      exercises = Array.isArray(data[1]) ? data[1] : [];
      renderAll();
    });
  }
  function fetchFirstJson(paths) {
    return paths.reduce(function (attempt, path) {
      return attempt.catch(function () {
        return fetch(path).then(function (res) {
          if (!res.ok) throw new Error('No se pudo cargar ' + path);
          return res.json();
        });
      });
    }, Promise.reject(new Error('Catálogo no encontrado')));
  }
  function normalizeFood(food, index) {
    var n = food.nutriments || {};
    return {
      id: String(food.id || food.code || ('food-' + index)),
      name: food.name || food.product_name || food.product_name_es || 'Alimento',
      brand: food.brand || food.brands || '',
      category: food.category || food.categories || 'Alimento',
      kcal: food.kcal != null ? num(food.kcal) : num(n['energy-kcal_100g'] != null ? n['energy-kcal_100g'] : n['energy-kcal']),
      protein: food.protein != null ? num(food.protein) : num(n.proteins_100g != null ? n.proteins_100g : n.proteins),
      carbs: food.carbs != null ? num(food.carbs) : num(n.carbohydrates_100g != null ? n.carbohydrates_100g : n.carbohydrates),
      fat: food.fat != null ? num(food.fat) : num(n.fat_100g != null ? n.fat_100g : n.fat),
      fiber: food.fiber != null ? num(food.fiber) : num(n.fiber_100g != null ? n.fiber_100g : n.fiber),
      stores: food.stores || '',
      source: food.source || 'Open Food Facts',
      url: food.url || (food.code ? 'https://world.openfoodfacts.org/product/' + food.code : '')
    };
  }
  function navTo(page) {
    if (!TITLES[page]) return;
    currentPage = page;
    document.querySelectorAll('.page-view').forEach(function (el) { el.classList.toggle('active', el.id === 'page-' + page); });
    document.querySelectorAll('[data-page]').forEach(function (el) { el.classList.toggle('active', el.getAttribute('data-page') === page && el.classList.contains('nav-item')); });
    var title = document.getElementById('page-title');
    if (title) title.textContent = TITLES[page];
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function renderAll() {
    renderDate(); renderDashboard(); renderNutrition(); renderTraining(); renderProgress(); renderAssistantContext();
    if (state.activeWorkout) updateTimerLabel();
  }
  function renderDate() {
    var node = document.getElementById('today-label');
    if (node) node.textContent = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
  }
  function macroPill(label, key, goal, dot) {
    return '<div class="macro-pill"><div class="macro-pill-head"><span class="macro-dot ' + dot + '"></span>' + label + '</div><strong>' + format(key) + '<small> / ' + format(goal) + ' g</small></strong></div>';
  }
  function renderDashboard() {
    var t = totalMacros(todayLog());
    var goals = state.goals;
    var left = Math.max(0, goals.calories - t.kcal);
    var consumed = document.getElementById('calories-eaten');
    if (consumed) consumed.textContent = format(t.kcal);
    var remaining = document.getElementById('calories-left');
    if (remaining) remaining.textContent = format(left);
    var goalNode = document.getElementById('calories-goal');
    if (goalNode) goalNode.textContent = format(goals.calories);
    var bar = document.getElementById('calorie-progress');
    var percent = Math.min(100, goals.calories ? t.kcal / goals.calories * 100 : 0);
    if (bar) bar.style.width = percent + '%';
    var ring = document.getElementById('calorie-ring');
    if (ring) ring.style.background = 'conic-gradient(#aed77a 0deg ' + (percent * 3.6) + 'deg,#f1f4ea ' + (percent * 3.6) + 'deg 360deg)';
    var macros = document.getElementById('dashboard-macros');
    if (macros) macros.innerHTML = macroPill('Proteína', t.protein, goals.protein, 'dot-protein') + macroPill('Carbohidratos', t.carbs, goals.carbs, 'dot-carbs') + macroPill('Grasas', t.fat, goals.fat, 'dot-fat');
    var routineCount = document.getElementById('routine-count');
    if (routineCount) routineCount.textContent = state.routines.length;
    var streak = document.getElementById('streak-count');
    if (streak) streak.textContent = workoutStreak();
    var recent = document.getElementById('recent-foods');
    if (recent) {
      var last = todayLog().slice().reverse().slice(0, 3);
      recent.innerHTML = last.length ? last.map(function (item) {
        return '<div class="recent-row"><div class="food-emoji">◍</div><div class="recent-row-copy"><strong>' + esc(item.name) + '</strong><small>' + esc(item.meal) + ' · ' + foodQuantityLabel(item) + '</small></div><div class="recent-kcal">' + format(item.kcal) + ' kcal</div></div>';
      }).join('') : '<div class="empty-state">Todavía no has añadido alimentos.<br>Registra el primero para ver tu día aquí.</div>';
    }
  }
  function renderNutrition() {
    var t = totalMacros(todayLog()), g = state.goals;
    var cards = document.getElementById('nutrition-macros');
    if (cards) {
      cards.innerHTML = [
        { key: 'protein', label: 'Proteína', klass: 'protein', dot: 'dot-protein', goal: g.protein },
        { key: 'carbs', label: 'Carbohidratos', klass: 'carbs', dot: 'dot-carbs', goal: g.carbs },
        { key: 'fat', label: 'Grasas', klass: 'fat', dot: 'dot-fat', goal: g.fat }
      ].map(function (m) {
        var p = Math.min(100, m.goal ? t[m.key] / m.goal * 100 : 0);
        return '<div class="macro-card ' + m.klass + '"><div class="macro-card-top"><span class="macro-dot ' + m.dot + '"></span>' + m.label + '</div><div class="macro-card-value">' + format(t[m.key]) + '<small> g</small></div><div class="macro-card-bottom"><span>Restan ' + format(Math.max(0, m.goal - t[m.key])) + ' g</span><span>Meta ' + format(m.goal) + ' g</span></div><div class="macro-bar"><span style="width:' + p + '%"></span></div></div>';
      }).join('');
    }
    setText('nutrition-eaten', format(t.kcal)); setText('nutrition-left', format(Math.max(0, g.calories - t.kcal)));
    var p = Math.min(100, g.calories ? t.kcal / g.calories * 100 : 0);
    var prog = document.getElementById('nutrition-progress'); if (prog) prog.style.width = p + '%';
    var target = document.getElementById('target-summary');
    if (target) target.innerHTML = '<div class="target-chip"><strong>' + format(g.calories) + '</strong><small>kcal</small></div><div class="target-chip"><strong>' + format(g.protein) + ' g</strong><small>proteína</small></div><div class="target-chip"><strong>' + format(g.carbs) + ' g</strong><small>carbos</small></div>';
    var host = document.getElementById('meal-sections');
    if (!host) return;
    host.innerHTML = MEALS.map(function (meal) {
      var rows = todayLog().filter(function (item) { return item.meal === meal.id; });
      var sum = totalMacros(rows);
      return '<article class="card meal-card"><div class="meal-head"><span class="meal-symbol">' + meal.icon + '</span><div><strong>' + meal.id + '</strong><small>' + (rows.length ? rows.length + (rows.length === 1 ? ' alimento' : ' alimentos') + ' · ' + format(sum.kcal) + ' kcal' : meal.hint) + '</small></div><button class="meal-add" data-add-meal="' + meal.id + '" aria-label="Añadir a ' + meal.id + '">＋</button></div><div class="meal-food-list">' + (rows.length ? rows.map(function (item) {
        return '<div class="meal-food-row"><div class="food-emoji">◍</div><div class="meal-food-copy"><strong>' + esc(item.name) + '</strong><small>' + foodQuantityLabel(item) + ' · ' + esc(item.source || 'Personalizado') + '</small></div><div class="meal-food-macros">' + format(item.kcal) + ' kcal<br>' + format(item.protein) + 'P · ' + format(item.carbs) + 'C · ' + format(item.fat) + 'G</div><button class="remove-food" data-remove-food="' + esc(item.id) + '" title="Quitar alimento" aria-label="Quitar ' + esc(item.name) + '">×</button></div>';
      }).join('') : '<div class="meal-empty">Añade los alimentos y cantidades que has tomado.</div>') + '</div></article>';
    }).join('');
  }
  function setText(id, value) { var el = document.getElementById(id); if (el) el.textContent = value; }
  function foodQuantityLabel(item) {
    if (item.unit === 'portion' || item.unit === 'ración') return format(item.quantity || 1) + (num(item.quantity) === 1 ? ' ración' : ' raciones');
    return format(item.grams != null ? item.grams : item.quantity) + ' g';
  }
  function renderTraining() {
    setText('routine-badge', state.routines.length);
    var host = document.getElementById('routine-list');
    if (host) host.innerHTML = state.routines.length ? state.routines.map(function (routine) {
      var muscles = routine.exercises.map(function (id) { var ex = findExercise(id); return ex && ex.muscle; }).filter(Boolean);
      var exerciseNames = routine.exercises.map(function (id) { var ex = findExercise(id); return ex && ex.name; }).filter(Boolean);
      return '<div class="routine-item"><div class="routine-icon">↗</div><div class="routine-copy"><strong>' + esc(routine.name) + '</strong><small>' + exerciseNames.length + ' ejercicios · ' + esc(unique(muscles).slice(0, 3).join(', ') || 'Sin grupo') + '</small></div><div class="routine-actions"><button class="small-button" data-start-routine="' + esc(routine.id) + '">Empezar</button><button class="small-icon-button" data-delete-routine="' + esc(routine.id) + '" title="Eliminar rutina">×</button></div></div>';
    }).join('') : '<div class="empty-state">Aún no tienes rutinas guardadas.<br>Crea una y añade tus ejercicios.</div>';
    renderExerciseBrowser();
    renderActiveWorkout();
  }
  function unique(values) { return values.filter(function (v, i) { return v && values.indexOf(v) === i; }); }
  function renderExerciseBrowser() {
    var host = document.getElementById('exercise-browser');
    if (!host) return;
    var query = exerciseQuery.toLowerCase().trim();
    var list = allExercises().filter(function (ex) { return !query || (ex.name + ' ' + ex.muscle + ' ' + ex.equipment).toLowerCase().indexOf(query) >= 0; }).slice(0, 80);
    host.innerHTML = list.length ? list.map(function (ex) {
      return '<div class="exercise-row"><span class="exercise-glyph">↗</span><div class="exercise-row-copy"><strong>' + esc(ex.name) + '</strong><small>' + esc(ex.muscle || 'General') + ' · ' + esc(ex.equipment || 'Libre') + ' · ' + (ex.mode === 'unilateral' ? 'Unilateral' : 'Bilateral') + '</small></div><button class="add-exercise" data-add-to-routine="' + esc(ex.id) + '" title="Añadir a una rutina">＋</button></div>';
    }).join('') : '<div class="empty-state">No se han encontrado ejercicios con ese nombre.</div>';
  }
  function renderActiveWorkout() {
    var host = document.getElementById('active-workout-host');
    if (!host) return;
    var active = state.activeWorkout;
    if (!active) { host.innerHTML = ''; if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } return; }
    host.innerHTML = '<article class="session-card"><div class="session-head"><div><div class="eyebrow">SESIÓN EN CURSO</div><h2>' + esc(active.name) + '</h2></div><div class="timer-display" id="timer-display">00:00</div></div><div class="session-exercises">' + active.exercises.map(function (ex, exIndex) {
      if (!Array.isArray(ex.sets)) ex.sets = [];
      if (!ex.mode) ex.mode = 'bilateral';
      var modeLabel = ex.mode === 'unilateral' ? 'Reps/lado' : 'Reps';
      return '<div class="session-exercise"><div class="session-exercise-head"><div><strong>' + esc(ex.name) + '</strong><small>' + esc(ex.muscle || 'General') + '</small></div><div class="session-exercise-controls"><label class="session-mode">Modo<select data-session-mode="' + exIndex + '" aria-label="Modo de ejecución para ' + esc(ex.name) + '"><option value="bilateral" ' + (ex.mode === 'bilateral' ? 'selected' : '') + '>Bilateral</option><option value="unilateral" ' + (ex.mode === 'unilateral' ? 'selected' : '') + '>Unilateral</option></select></label><div class="series-adjuster" aria-label="Número de series"><button type="button" data-remove-set="' + exIndex + '" aria-label="Quitar una serie" ' + (ex.sets.length <= 1 ? 'disabled' : '') + '>−</button><small>' + ex.sets.length + ' series</small><button type="button" data-add-set="' + exIndex + '" aria-label="Añadir una serie">＋</button></div></div></div><div class="set-table"><span>Serie</span><span>' + modeLabel + '</span><span>RIR</span><span>kg</span><span>Hecha</span>' + ex.sets.map(function (set, setIndex) {
        return '<span>' + (setIndex + 1) + '</span><input type="number" min="1" step="1" value="' + esc(set.reps) + '" data-session-value="' + exIndex + ',' + setIndex + ',reps" aria-label="' + (ex.mode === 'unilateral' ? 'Repeticiones por lado' : 'Repeticiones') + '"><input type="number" min="0" step="1" value="' + esc(set.rir) + '" data-session-value="' + exIndex + ',' + setIndex + ',rir" aria-label="RIR"><input type="number" min="0" step="0.5" value="' + esc(set.weight || 0) + '" data-session-value="' + exIndex + ',' + setIndex + ',weight" aria-label="Peso en kg"><input type="checkbox" ' + (set.done ? 'checked' : '') + ' data-session-value="' + exIndex + ',' + setIndex + ',done" aria-label="Marcar serie completada">';
      }).join('') + '</div></div>';
    }).join('') + '</div><div class="session-footer"><small>Registra cada serie para medir tu progreso.</small><button class="button button-light" data-finish-workout>Terminar sesión ✓</button></div></article>';
    if (!timerInterval) timerInterval = window.setInterval(updateTimerLabel, 1000);
    updateTimerLabel();
  }
  function updateTimerLabel() {
    var node = document.getElementById('timer-display');
    if (!node || !state.activeWorkout) return;
    var seconds = Math.max(0, Math.floor((Date.now() - state.activeWorkout.startedAt) / 1000));
    node.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }
  function renderProgress() {
    var chart = document.getElementById('muscle-chart');
    if (!chart) return;
    var since = Date.now() - 28 * 24 * 60 * 60 * 1000;
    var recent = state.workouts.filter(function (w) { return new Date(w.date).getTime() >= since; });
    var counts = {};
    MUSCLE_GROUPS.forEach(function (m) { counts[m] = 0; });
    recent.forEach(function (workout) { workout.exercises.forEach(function (ex) {
      var key = MUSCLE_GROUPS.find(function (m) { return m.toLowerCase() === String(ex.muscle || '').toLowerCase(); }) || ex.muscle;
      if (!key) return; counts[key] = (counts[key] || 0) + ex.sets.filter(function (s) { return s.done; }).length;
    }); });
    var max = Math.max(1, ...Object.keys(counts).map(function (k) { return counts[k]; }));
    chart.innerHTML = MUSCLE_GROUPS.map(function (muscle) {
      var value = counts[muscle] || 0;
      return '<div class="muscle-column"><span class="muscle-value">' + value + '</span><div class="muscle-bar" style="height:' + Math.max(4, value / max * 105) + 'px"></div><span class="muscle-name">' + muscle + '</span></div>';
    }).join('');
    var totalSets = recent.reduce(function (sum, w) { return sum + w.exercises.reduce(function (x, e) { return x + e.sets.filter(function (s) { return s.done; }).length; }, 0); }, 0);
    var minutes = recent.reduce(function (sum, w) { return sum + Math.round((w.durationMs || 0) / 60000); }, 0);
    var summary = document.getElementById('activity-summary');
    if (summary) summary.innerHTML = '<div class="activity-stat"><span>Sesiones completadas</span><strong>' + recent.length + '</strong></div><div class="activity-stat"><span>Series registradas</span><strong>' + totalSets + '</strong></div><div class="activity-stat"><span>Tiempo entrenando</span><strong>' + minutes + ' min</strong></div>';
    var history = document.getElementById('workout-history');
    if (history) history.innerHTML = state.workouts.length ? state.workouts.slice().reverse().slice(0, 12).map(function (w) {
      var date = new Date(w.date);
      return '<div class="history-item"><div class="history-date">' + new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(date) + '</div><div class="history-copy"><strong>' + esc(w.name) + '</strong><small>' + w.exercises.length + ' ejercicios · ' + w.exercises.reduce(function (n, ex) { return n + ex.sets.filter(function (s) { return s.done; }).length; }, 0) + ' series</small></div><span class="history-duration">' + Math.round((w.durationMs || 0) / 60000) + ' min</span></div>';
    }).join('') : '<div class="empty-state">Cuando termines una sesión, aparecerá aquí tu historial.</div>';
  }
  function workoutStreak() {
    var dates = {};
    state.workouts.forEach(function (w) { dates[dateKey(new Date(w.date))] = true; });
    var count = 0; var d = new Date();
    while (dates[dateKey(d)]) { count++; d.setDate(d.getDate() - 1); }
    if (!count) { d = new Date(); d.setDate(d.getDate() - 1); if (dates[dateKey(d)]) { count = 1; d.setDate(d.getDate() - 1); while (dates[dateKey(d)]) { count++; d.setDate(d.getDate() - 1); } } }
    return count;
  }
  function renderAssistantContext() {
    var host = document.getElementById('assistant-context');
    if (!host) return;
    var t = totalMacros(todayLog());
    host.innerHTML = '<div class="context-row"><span>Calorías restantes</span><strong>' + format(Math.max(0, state.goals.calories - t.kcal)) + ' kcal</strong></div><div class="context-row"><span>Proteína restante</span><strong>' + format(Math.max(0, state.goals.protein - t.protein)) + ' g</strong></div><div class="context-row"><span>Rutinas guardadas</span><strong>' + state.routines.length + '</strong></div><div class="context-row"><span>Sesiones completadas</span><strong>' + state.workouts.length + '</strong></div>';
  }
  function modal(content, wide) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal-backdrop" data-close-backdrop><div class="modal ' + (wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' + content + '</div></div>';
    var first = root.querySelector('input,button,select,textarea');
    if (first) first.focus();
  }
  function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
  function openTargets() {
    var g = state.goals;
    modal('<div class="modal-header"><div><div class="eyebrow">TU PLAN</div><h2>Objetivos diarios</h2></div><button class="close-modal" data-close-modal>×</button></div><form id="targets-form"><p class="modal-hint">Define una meta personal. Puedes cambiarla en cualquier momento.</p><div class="form-grid"><div class="field"><label for="goal-calories">Calorías (kcal)</label><input id="goal-calories" name="calories" type="number" min="0" value="' + esc(g.calories) + '" required></div><div class="field"><label for="goal-protein">Proteína (g)</label><input id="goal-protein" name="protein" type="number" min="0" step="1" value="' + esc(g.protein) + '" required></div><div class="field"><label for="goal-carbs">Carbohidratos (g)</label><input id="goal-carbs" name="carbs" type="number" min="0" step="1" value="' + esc(g.carbs) + '" required></div><div class="field"><label for="goal-fat">Grasas (g)</label><input id="goal-fat" name="fat" type="number" min="0" step="1" value="' + esc(g.fat) + '" required></div></div><div class="modal-footer"><button type="button" class="button button-quiet" data-close-modal>Cancelar</button><button class="button button-dark" type="submit">Guardar objetivos</button></div></form>');
  }
  function foodModalHtml() {
    var selected = foodDraft.selected ? findFood(foodDraft.selected) : null;
    var results = foodDraft.tab === 'catalog' ? getFoodMatches(foodDraft.query).slice(0, 35).map(function (food) {
      return '<button type="button" class="catalog-result ' + (foodDraft.selected === food.id ? 'selected' : '') + '" data-select-food="' + esc(food.id) + '"><span class="food-emoji">◍</span><span class="catalog-result-copy"><strong>' + esc(food.name) + '</strong><small>' + esc([food.brand, food.stores || food.category].filter(Boolean).join(' · ')) + '</small></span><span class="catalog-result-macros">' + format(food.kcal) + ' kcal/' + (food.unit === 'portion' ? 'ración' : '100 g') + '<br>' + format(food.protein) + 'P · ' + format(food.carbs) + 'C · ' + format(food.fat) + 'G</span></button>';
    }).join('') : '';
    var catalogContent = '<div class="field"><label for="food-search">Busca por nombre, marca o supermercado</label><input id="food-search" type="search" value="' + esc(foodDraft.query) + '" placeholder="Ej. arroz, pechuga, yogur..." autocomplete="off"></div><div id="catalog-results" class="catalog-results">' + (results || '<div class="empty-state">' + (foods.length ? 'No hay coincidencias.' : 'Cargando catálogo. Recarga cuando la conexión esté disponible.') + '</div>') + '</div>';
    var savedPersonalFoods = state.customFoods.map(function (food) {
      return '<button type="button" class="personal-food-option" data-use-custom-food="' + esc(food.id) + '"><span><strong>' + esc(food.name) + '</strong><small>' + format(food.kcal) + ' kcal/' + (food.unit === 'portion' ? 'ración' : '100 g') + ' · ' + format(food.protein) + 'P · ' + format(food.carbs) + 'C · ' + format(food.fat) + 'G</small></span><span>＋</span></button>';
    }).join('');
    var customContent = '<div class="personal-food-library"><div class="personal-food-library-head"><strong>Mis comidas guardadas</strong><small>Se conservan en este navegador.</small></div>' + (savedPersonalFoods || '<div class="meal-empty">Todavía no has guardado comidas. Añade una abajo para tenerla siempre en tu catálogo personal.</div>') + '</div><form id="custom-food-form"><div class="field"><label for="custom-food-name">Nombre del alimento o comida</label><input id="custom-food-name" name="name" placeholder="Ej. Mi bowl de pollo y arroz" required></div><div class="field"><label for="custom-food-basis">¿A qué cantidad corresponden los macros?</label><select id="custom-food-basis" name="basis"><option value="100g">Por 100 g</option><option value="portion">Por ración</option></select><small id="custom-food-basis-note">Introduce los macros por 100 g. Se guardará en tu catálogo personal.</small></div><div class="form-grid"><div class="field"><label for="custom-food-kcal">Calorías (kcal)</label><input id="custom-food-kcal" name="kcal" type="number" min="0" step="0.1" required></div><div class="field"><label for="custom-food-protein">Proteína (g)</label><input id="custom-food-protein" name="protein" type="number" min="0" step="0.1" required></div><div class="field"><label for="custom-food-carbs">Carbohidratos (g)</label><input id="custom-food-carbs" name="carbs" type="number" min="0" step="0.1" required></div><div class="field"><label for="custom-food-fat">Grasas (g)</label><input id="custom-food-fat" name="fat" type="number" min="0" step="0.1" required></div></div><button type="submit" class="button button-light full-width">Guardar en mi catálogo personal</button></form>';
    var selectedContent = selected
      ? '<div class="selected-food"><span class="food-emoji">◍</span><div><strong>' + esc(selected.name) + '</strong><small>' + format(selected.kcal) + ' kcal · P ' + format(selected.protein) + ' · C ' + format(selected.carbs) + ' · G ' + format(selected.fat) + ' ' + (selected.unit === 'portion' ? 'por ración' : 'por 100 g') + (selected.url ? ' · <a class="food-source-link" href="' + esc(selected.url) + '" target="_blank" rel="noopener noreferrer">Ver fuente</a>' : '') + '</small></div></div><div class="form-grid"><div class="field"><label for="food-amount">' + (selected.unit === 'portion' ? 'Cantidad (raciones)' : 'Cantidad (g)') + '</label><input id="food-amount" type="number" min="0.01" step="' + (selected.unit === 'portion' ? '0.25' : '1') + '" value="' + (selected.unit === 'portion' ? '1' : '100') + '" required></div><div class="field"><label for="food-meal">Comida</label><select id="food-meal">' + MEALS.map(function (m) { return '<option ' + (foodDraft.meal === m.id ? 'selected' : '') + '>' + m.id + '</option>'; }).join('') + '</select></div></div><div class="modal-error" id="food-error"></div><div class="modal-footer"><button type="button" class="button button-quiet" data-close-modal>Cancelar</button><button type="button" class="button button-dark" data-confirm-food>Añadir al diario</button></div>'
      : '<div class="modal-hint" style="margin-top:12px">Selecciona un alimento y después indica la cantidad.</div>';
    var selectionArea = foodDraft.tab === 'catalog' ? '<div id="selected-food-area">' + selectedContent + '</div>' : '';
    return '<div class="modal-header"><div><div class="eyebrow">DIARIO DE HOY</div><h2>Añadir alimento</h2></div><button class="close-modal" data-close-modal>×</button></div><div class="catalog-tabs"><button type="button" data-food-tab="catalog" class="' + (foodDraft.tab === 'catalog' ? 'active' : '') + '">Catálogo (' + foods.length.toLocaleString('es-ES') + ')</button><button type="button" data-food-tab="custom" class="' + (foodDraft.tab === 'custom' ? 'active' : '') + '">Crear mi comida</button></div><div class="food-tab-content">' + (foodDraft.tab === 'catalog' ? catalogContent : customContent) + '</div>' + selectionArea;
  }
  function getFoodMatches(query) {
    var q = String(query || '').toLowerCase().trim();
    var list = allFoods();
    if (!q) return list.slice(0, 45);
    return list.filter(function (food) { return (food.name + ' ' + food.brand + ' ' + food.category + ' ' + food.stores).toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) {
      var aa = a.name.toLowerCase().startsWith(q) ? 0 : 1; var bb = b.name.toLowerCase().startsWith(q) ? 0 : 1; return aa - bb;
    });
  }
  function openAddFood(meal) {
    foodDraft = { query: '', selected: null, meal: meal || 'Desayuno', tab: 'catalog' };
    modal(foodModalHtml(), true);
    bindFoodSearch();
  }
  function bindFoodSearch() {
    var input = document.getElementById('food-search');
    if (input) input.addEventListener('input', function () {
      foodDraft.query = input.value;
      var resultHost = document.getElementById('catalog-results');
      if (!resultHost) return;
      var matched = getFoodMatches(foodDraft.query).slice(0, 35);
      resultHost.innerHTML = matched.length ? matched.map(function (food) {
        return '<button type="button" class="catalog-result ' + (foodDraft.selected === food.id ? 'selected' : '') + '" data-select-food="' + esc(food.id) + '"><span class="food-emoji">◍</span><span class="catalog-result-copy"><strong>' + esc(food.name) + '</strong><small>' + esc([food.brand, food.stores || food.category].filter(Boolean).join(' · ')) + '</small></span><span class="catalog-result-macros">' + format(food.kcal) + ' kcal/' + (food.unit === 'portion' ? 'ración' : '100 g') + '<br>' + format(food.protein) + 'P · ' + format(food.carbs) + 'C · ' + format(food.fat) + 'G</span></button>';
      }).join('') : '<div class="empty-state">No hay coincidencias.</div>';
    });
  }
  function addFoodToLog() {
    var food = foodDraft.selected ? findFood(foodDraft.selected) : null;
    var amount = num(document.getElementById('food-amount') && document.getElementById('food-amount').value);
    var error = document.getElementById('food-error');
    if (!food) { if (error) error.textContent = 'Selecciona un alimento del catálogo.'; return; }
    if (amount <= 0) { if (error) error.textContent = 'Introduce una cantidad mayor que cero.'; return; }
    var unit = food.unit === 'portion' ? 'portion' : 'g';
    var ratio = unit === 'portion' ? amount : amount / 100;
    state.log.push({
      id: id(), foodId: food.id, name: food.name, brand: food.brand, source: food.source || 'Open Food Facts',
      grams: unit === 'g' ? amount : null, quantity: amount, unit: unit, kcal: round(food.kcal * ratio, 1), protein: round(food.protein * ratio, 1),
      carbs: round(food.carbs * ratio, 1), fat: round(food.fat * ratio, 1), meal: document.getElementById('food-meal').value, date: dateKey()
    });
    saveState(); closeModal(); renderAll(); toast('Alimento añadido al diario.');
  }
  function id() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function saveCustomFood(form) {
    var values = new FormData(form);
    var item = {
      id: id(), name: String(values.get('name') || '').trim(), brand: 'Creado por ti', category: 'Personalizado',
      kcal: num(values.get('kcal')), protein: num(values.get('protein')), carbs: num(values.get('carbs')), fat: num(values.get('fat')), unit: values.get('basis') === 'portion' ? 'portion' : '100g', source: 'Comida personalizada'
    };
    if (!item.name) return;
    state.customFoods.unshift(item); saveState();
    foodDraft.selected = item.id; foodDraft.tab = 'catalog'; foodDraft.query = item.name;
    modal(foodModalHtml(), true); bindFoodSearch(); toast('Comida guardada en tu catálogo personal.');
  }
  function openRoutineModal() {
    routineDraft = { name: '', exercises: [], query: '' };
    renderRoutineModal();
  }
  function renderRoutineModal() {
    var q = routineDraft.query.toLowerCase().trim();
    var results = allExercises().filter(function (e) { return !q || (e.name + ' ' + e.muscle + ' ' + e.equipment).toLowerCase().indexOf(q) >= 0; }).slice(0, 28);
    var chosen = routineDraft.exercises.map(function (entry, ix) {
      var ex = findExercise(entry.exerciseId);
      return '<div class="exercise-row"><span class="exercise-glyph">' + (ix + 1) + '</span><div class="exercise-row-copy"><strong>' + esc(ex ? ex.name : 'Ejercicio') + '</strong><small>' + esc(ex ? ex.muscle : '') + '</small></div><button type="button" class="small-icon-button" data-remove-draft="' + ix + '">×</button></div>';
    }).join('');
    var html = '<div class="modal-header"><div><div class="eyebrow">PLAN DE FUERZA</div><h2>Nueva rutina</h2></div><button class="close-modal" data-close-modal>×</button></div><div class="field"><label for="routine-name">Nombre de la rutina</label><input id="routine-name" value="' + esc(routineDraft.name) + '" placeholder="Ej. Tren superior A" required></div><div class="field"><label for="routine-exercise-search">Añade ejercicios</label><input id="routine-exercise-search" value="' + esc(routineDraft.query) + '" placeholder="Buscar ejercicio o grupo muscular..."></div><div class="catalog-results" id="routine-exercise-results">' + results.map(function (ex) {
      return '<button type="button" class="catalog-result" data-draft-exercise="' + esc(ex.id) + '"><span class="exercise-glyph">↗</span><span class="catalog-result-copy"><strong>' + esc(ex.name) + '</strong><small>' + esc(ex.muscle || 'General') + ' · ' + esc(ex.equipment || 'Libre') + '</small></span><span class="catalog-result-macros">＋</span></button>';
    }).join('') + '</div><div class="field"><label>Ejercicios elegidos (' + routineDraft.exercises.length + ')</label><div>' + (chosen || '<div class="meal-empty">Añade los ejercicios que formarán parte de la rutina.</div>') + '</div></div><div class="modal-error" id="routine-error"></div><div class="modal-footer"><button type="button" class="button button-quiet" data-close-modal>Cancelar</button><button type="button" class="button button-dark" data-save-routine>Guardar rutina</button></div>';
    modal(html, true);
    var nameInput = document.getElementById('routine-name');
    nameInput.addEventListener('input', function () { routineDraft.name = nameInput.value; });
    var search = document.getElementById('routine-exercise-search');
    search.addEventListener('input', function () { routineDraft.query = search.value; renderRoutineModal(); var next = document.getElementById('routine-exercise-search'); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });
  }
  function saveRoutine() {
    var error = document.getElementById('routine-error');
    var name = (document.getElementById('routine-name').value || '').trim();
    if (!name) { if (error) error.textContent = 'Ponle un nombre a la rutina.'; return; }
    if (!routineDraft.exercises.length) { if (error) error.textContent = 'Añade al menos un ejercicio.'; return; }
    state.routines.push({ id: id(), name: name, exercises: routineDraft.exercises.map(function (e) { return e.exerciseId; }), createdAt: new Date().toISOString() });
    saveState(); closeModal(); renderAll(); toast('Rutina guardada.');
  }
  function startWorkout(routineId) {
    if (state.activeWorkout && !window.confirm('Ya tienes una sesión en curso. ¿Quieres sustituirla?')) return;
    var routine = state.routines.find(function (r) { return String(r.id) === String(routineId); });
    if (!routine) return;
    state.activeWorkout = {
      id: id(), routineId: routine.id, name: routine.name, startedAt: Date.now(),
      exercises: routine.exercises.map(function (exerciseId) {
        var ex = findExercise(exerciseId) || { id: exerciseId, name: 'Ejercicio', muscle: 'General' };
        return { exerciseId: exerciseId, name: ex.name, muscle: ex.muscle || 'General', mode: ex.mode || 'bilateral', sets: [{ reps: 10, rir: 2, weight: 0, done: false }, { reps: 10, rir: 2, weight: 0, done: false }, { reps: 10, rir: 2, weight: 0, done: false }] };
      })
    };
    saveState(); renderAll(); navTo('training'); toast('Sesión iniciada. ¡A por ello!');
  }
  function adjustWorkoutSets(exerciseIndex, change) {
    var active = state.activeWorkout;
    var exercise = active && active.exercises[Number(exerciseIndex)];
    if (!exercise) return;
    if (change > 0) {
      var previous = exercise.sets[exercise.sets.length - 1] || { reps: 10, rir: 2, weight: 0 };
      exercise.sets.push({ reps: num(previous.reps) || 10, rir: num(previous.rir), weight: num(previous.weight), done: false });
    } else if (exercise.sets.length > 1) {
      exercise.sets.pop();
    }
    saveState(); renderActiveWorkout();
  }
  function setWorkoutMode(exerciseIndex, mode) {
    var exercise = state.activeWorkout && state.activeWorkout.exercises[Number(exerciseIndex)];
    if (!exercise) return;
    exercise.mode = mode === 'unilateral' ? 'unilateral' : 'bilateral';
    saveState(); renderActiveWorkout();
  }
  function finishWorkout() {
    if (!state.activeWorkout) return;
    var workout = state.activeWorkout;
    workout.finishedAt = new Date().toISOString();
    workout.durationMs = Date.now() - workout.startedAt;
    workout.date = workout.finishedAt;
    workout.exercises = workout.exercises.map(function (ex) { return Object.assign({}, ex, { sets: ex.sets.filter(function (set) { return set.done; }) }); }).filter(function (ex) { return ex.sets.length; });
    state.workouts.push(workout); state.activeWorkout = null; saveState(); renderAll(); toast('Entrenamiento guardado en tu historial.');
  }
  function openCustomExercise() {
    modal('<div class="modal-header"><div><div class="eyebrow">BIBLIOTECA PERSONAL</div><h2>Añadir ejercicio</h2></div><button class="close-modal" data-close-modal>×</button></div><form id="custom-exercise-form"><div class="field"><label for="custom-exercise-name">Nombre</label><input id="custom-exercise-name" name="name" placeholder="Ej. Press con mancuernas en el suelo" required></div><div class="form-grid"><div class="field"><label for="custom-exercise-muscle">Grupo muscular</label><select id="custom-exercise-muscle" name="muscle">' + MUSCLE_GROUPS.map(function (m) { return '<option>' + m + '</option>'; }).join('') + '</select></div><div class="field"><label for="custom-exercise-equipment">Material</label><input id="custom-exercise-equipment" name="equipment" placeholder="Mancuernas, banda..."></div><div class="field"><label for="custom-exercise-mode">Modo habitual</label><select id="custom-exercise-mode" name="mode"><option value="bilateral">Bilateral</option><option value="unilateral">Unilateral</option></select></div></div><div class="modal-hint">El modo se puede cambiar durante cada entrenamiento.</div><div class="modal-footer"><button type="button" class="button button-quiet" data-close-modal>Cancelar</button><button class="button button-dark" type="submit">Guardar ejercicio</button></div></form>');
  }
  function saveCustomExercise(form) {
    var values = new FormData(form);
    var name = String(values.get('name') || '').trim();
    if (!name) return;
    var item = { id: id(), name: name, muscle: String(values.get('muscle') || 'General'), equipment: String(values.get('equipment') || 'Libre'), mode: values.get('mode') === 'unilateral' ? 'unilateral' : 'bilateral', source: 'Personalizado' };
    state.customExercises.unshift(item); saveState(); closeModal(); renderAll(); toast('Ejercicio guardado en tu biblioteca.');
  }
  function chatContext() {
    var t = totalMacros(todayLog());
    return {
      goals: state.goals,
      today: { consumed: t, remaining: { calories: Math.max(0, state.goals.calories - t.kcal), protein: Math.max(0, state.goals.protein - t.protein), carbs: Math.max(0, state.goals.carbs - t.carbs), fat: Math.max(0, state.goals.fat - t.fat) }, foods: todayLog().map(function (f) { return { name: f.name, quantity: f.quantity || f.grams, unit: f.unit || 'g', meal: f.meal, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat }; }) },
      recentWorkouts: state.workouts.slice(-5).map(function (w) { return { name: w.name, date: w.date, durationMinutes: Math.round((w.durationMs || 0) / 60000), exercises: w.exercises.map(function (e) { return { name: e.name, muscle: e.muscle, sets: e.sets.length }; }) }; })
    };
  }
  function externalAssistantPrompt(question) {
    return [
      'Ayúdame como asistente de alimentación y entrenamiento. Responde en español, de forma práctica y segura. No inventes valores nutricionales exactos ni sustituyas a profesionales sanitarios.',
      'Mi pregunta: ' + (String(question || '').trim() || 'Revisa mi resumen y dame una recomendación útil para hoy.'),
      'Resumen de FitAI (macros y registros de hoy, objetivos diarios y hasta cinco entrenamientos recientes):',
      JSON.stringify(chatContext(), null, 2)
    ].join('\n\n');
  }
  function copyPrompt(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var field = document.createElement('textarea');
      field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.appendChild(field); field.select();
      var copied = document.execCommand('copy'); field.remove();
      copied ? resolve() : reject(new Error('No se pudo copiar automáticamente.'));
    });
  }
  function openFreeAssistant(question) {
    var prompt = externalAssistantPrompt(question);
    var copied = copyPrompt(prompt);
    window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
    copied.then(function () {
      toast('Resumen copiado. Pégalo en la pestaña de ChatGPT.');
    }).catch(function () {
      modal('<div class="modal-header"><div><div class="eyebrow">COPIA MANUAL</div><h2>Pega este resumen en ChatGPT</h2></div><button class="close-modal" data-close-modal>×</button></div><textarea class="assistant-copy-box" id="assistant-copy-box" rows="12">' + esc(prompt) + '</textarea><p class="chat-note">El texto está seleccionado: copia con Ctrl+C y pégalo en ChatGPT.</p>');
      var field = document.getElementById('assistant-copy-box'); if (field) { field.focus(); field.select(); }
    });
  }  function bindEvents() {
    document.addEventListener('click', function (event) {
      var nav = event.target.closest('[data-page]');
      if (nav) { event.preventDefault(); navTo(nav.getAttribute('data-page')); return; }
      var action = event.target.closest('[data-action]');
      if (action) {
        var kind = action.getAttribute('data-action');
        if (kind === 'targets') openTargets();
        if (kind === 'add-food') openAddFood();
        if (kind === 'new-routine') openRoutineModal();
        if (kind === 'new-exercise') openCustomExercise();
        return;
      }
      var mealButton = event.target.closest('[data-add-meal]');
      if (mealButton) { openAddFood(mealButton.getAttribute('data-add-meal')); return; }
      if (event.target.closest('[data-close-modal]')) { closeModal(); return; }
      if (event.target.hasAttribute('data-close-backdrop')) { closeModal(); return; }
      var tab = event.target.closest('[data-food-tab]');
      if (tab) { foodDraft.tab = tab.getAttribute('data-food-tab'); modal(foodModalHtml(), true); bindFoodSearch(); return; }
      var selectedFood = event.target.closest('[data-select-food]');
      if (selectedFood) { foodDraft.selected = selectedFood.getAttribute('data-select-food'); modal(foodModalHtml(), true); bindFoodSearch(); return; }
      var savedFood = event.target.closest('[data-use-custom-food]');
      if (savedFood) {
        var savedId = savedFood.getAttribute('data-use-custom-food');
        var savedItem = findFood(savedId);
        if (savedItem) { foodDraft.tab = 'catalog'; foodDraft.selected = savedId; foodDraft.query = savedItem.name; modal(foodModalHtml(), true); bindFoodSearch(); }
        return;
      }
      if (event.target.closest('[data-confirm-food]')) { addFoodToLog(); return; }
      var removeFood = event.target.closest('[data-remove-food]');
      if (removeFood) { state.log = state.log.filter(function (item) { return String(item.id) !== String(removeFood.getAttribute('data-remove-food')); }); saveState(); renderAll(); toast('Alimento eliminado.'); return; }
      if (event.target.closest('[data-save-routine]')) { saveRoutine(); return; }
      var draftEx = event.target.closest('[data-draft-exercise]');
      if (draftEx) {
        var exId = draftEx.getAttribute('data-draft-exercise');
        if (!routineDraft.exercises.some(function (e) { return String(e.exerciseId) === exId; })) routineDraft.exercises.push({ exerciseId: exId });
        renderRoutineModal(); return;
      }
      var removeDraft = event.target.closest('[data-remove-draft]');
      if (removeDraft) { routineDraft.exercises.splice(Number(removeDraft.getAttribute('data-remove-draft')), 1); renderRoutineModal(); return; }
      var addSet = event.target.closest('[data-add-set]');
      if (addSet) { adjustWorkoutSets(addSet.getAttribute('data-add-set'), 1); return; }
      var removeSet = event.target.closest('[data-remove-set]');
      if (removeSet) { adjustWorkoutSets(removeSet.getAttribute('data-remove-set'), -1); return; }
      var start = event.target.closest('[data-start-routine]');
      if (start) { startWorkout(start.getAttribute('data-start-routine')); return; }
      var deleteRoutine = event.target.closest('[data-delete-routine]');
      if (deleteRoutine) {
        state.routines = state.routines.filter(function (r) { return String(r.id) !== String(deleteRoutine.getAttribute('data-delete-routine')); });
        saveState(); renderAll(); toast('Rutina eliminada.'); return;
      }
      var addToRoutine = event.target.closest('[data-add-to-routine]');
      if (addToRoutine) {
        var found = findExercise(addToRoutine.getAttribute('data-add-to-routine'));
        if (found) { routineDraft = { name: 'Nueva rutina', exercises: [{ exerciseId: found.id }], query: '' }; renderRoutineModal(); }
        return;
      }
      if (event.target.closest('[data-finish-workout]')) { finishWorkout(); return; }
      var prompt = event.target.closest('[data-prompt]');
      if (prompt) { navTo('assistant'); openFreeAssistant(prompt.getAttribute('data-prompt')); return; }
    });
    document.addEventListener('submit', function (event) {
      if (event.target.id === 'targets-form') {
        event.preventDefault();
        var data = new FormData(event.target);
        ['calories', 'protein', 'carbs', 'fat'].forEach(function (key) { state.goals[key] = num(data.get(key)); });
        saveState(); closeModal(); renderAll(); toast('Objetivos actualizados.'); return;
      }
      if (event.target.id === 'custom-food-form') { event.preventDefault(); saveCustomFood(event.target); return; }
      if (event.target.id === 'custom-exercise-form') { event.preventDefault(); saveCustomExercise(event.target); return; }
      if (event.target.id === 'external-ai-form') {
        event.preventDefault(); openFreeAssistant(document.getElementById('external-ai-question').value); return;
      }
    });
    document.addEventListener('input', function (event) {
      if (event.target.id === 'exercise-search') { exerciseQuery = event.target.value; renderExerciseBrowser(); }
      if (event.target.id === 'routine-name') routineDraft.name = event.target.value;
      if (event.target.matches('[data-session-value]') && state.activeWorkout) {
        var parts = event.target.getAttribute('data-session-value').split(',');
        var exercise = state.activeWorkout.exercises[Number(parts[0])]; var set = exercise && exercise.sets[Number(parts[1])];
        if (!set) return;
        set[parts[2]] = parts[2] === 'done' ? event.target.checked : num(event.target.value);
        saveState();
      }
      if (event.target.id === 'external-ai-question') {
        event.target.style.height = 'auto'; event.target.style.height = Math.min(110, event.target.scrollHeight) + 'px';
      }
    });
    document.addEventListener('change', function (event) {
      if (event.target.id === 'custom-food-basis') {
        var basisNote = document.getElementById('custom-food-basis-note');
        if (basisNote) basisNote.textContent = event.target.value === 'portion'
          ? 'Introduce los macros de una ración. Al añadirla al diario podrás indicar cuántas raciones has comido.'
          : 'Introduce los macros por 100 g. Se guardará en tu catálogo personal.';
      }
      if (event.target.matches('[data-session-mode]')) {
        setWorkoutMode(event.target.getAttribute('data-session-mode'), event.target.value); return;
      }
      if (event.target.matches('[data-session-value]') && state.activeWorkout) {
        var p = event.target.getAttribute('data-session-value').split(',');
        var exercise = state.activeWorkout.exercises[Number(p[0])]; var set = exercise && exercise.sets[Number(p[1])];
        if (set) { set[p[2]] = p[2] === 'done' ? event.target.checked : num(event.target.value); saveState(); }
      }
    });
  }
  function init() {
    bindEvents(); renderAll(); loadCatalogs();
    if (state.activeWorkout) timerInterval = window.setInterval(updateTimerLabel, 1000);
  }  document.addEventListener('DOMContentLoaded', init);
}());



