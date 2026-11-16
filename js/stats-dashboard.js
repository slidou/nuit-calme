/* Tableau de bord. Les visualisations et leurs tableaux lisent le même
   modèle en mémoire. Aucun binaire de livre n'est chargé ici. */
'use strict';

NC.statsDashboard = (() => {
  const { $, readingStats: stats } = NC;
  const number = new Intl.NumberFormat('fr-FR');
  const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const dayName = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' });
  const shortDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  const count = (n) => number.format(n);
  const duration = (n) => n === 0 ? '0 min' : n < 60 ? '< 1 min' : NC.fmtDur(n);
  const dated = (ts) => stats.positive(ts) ? dateTime.format(ts) : 'Inconnue';
  const states = { unknown: 'Historique inconnu', none: 'Aucune activité enregistrée',
    zero: '0 min mesurée', future: 'À venir' };
  const thresholds = [5 * 60, 20 * 60, 45 * 60];

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action) {
    const node = el('button', text, 'mini-btn');
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function section(parent, title) {
    const node = el('section', undefined, 'stats-section');
    node.append(el('h3', title));
    parent.append(node);
    return node;
  }
  function field(label, choices, change) {
    const root = el('label', label, 'stats-field');
    const select = el('select');
    for (const [value, name] of choices) select.add(new Option(name, value));
    select.addEventListener('change', () => change(select.value));
    root.append(select);
    return root;
  }
  function cards(parent, values) {
    const root = el('dl', undefined, 'stats-cards');
    for (const [label, value] of values) {
      const card = el('div');
      card.append(el('dt', label), el('dd', value));
      root.append(card);
    }
    parent.append(root);
  }

  function calendar(parent, model) {
    const root = section(parent, 'Calendrier d’activité');
    const pivot = el('div', undefined, 'stats-calendar-title');
    const label = el('h4');
    label.setAttribute('aria-live', 'polite');
    const grid = el('div', undefined, 'stats-calendar-grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Jours du mois');
    const detail = el('p', undefined, 'stats-day-detail');
    detail.setAttribute('role', 'status');
    const starts = [model.earliest, model.since].filter(Boolean).sort();
    const first = stats.period(starts[0] || model.today, 'month');
    const currentMonth = stats.period(model.today, 'month');
    const last = stats.period(model.dates.at(-1) > model.today ? model.dates.at(-1) : model.today, 'month');
    let month = currentMonth;
    let selected = model.today;
    const move = (count) => {
      const next = stats.shiftMonth(month, count);
      if (next < first || next > last) return;
      const control = document.activeElement;
      month = next;
      selected = month === currentMonth ? model.today : month;
      render();
      if (control?.disabled) select(selected, true);
    };
    const back = button('‹', () => move(-1));
    back.setAttribute('aria-label', 'Mois précédent');
    const ahead = button('›', () => move(1));
    ahead.setAttribute('aria-label', 'Mois suivant');
    pivot.append(back, label, ahead);
    root.append(pivot, grid, detail);

    const legend = el('ul', undefined, 'stats-legend');
    for (const [state, name] of Object.entries({ unknown: 'Historique inconnu', none: 'Aucune activité enregistrée',
      zero: '0 min mesurée', level1: 'Moins de 5 min', level2: '5 à 19 min', level3: '20 à 44 min', level4: '45 min et plus' })) {
      const item = el('li');
      const swatch = el('span', undefined, 'stats-swatch');
      swatch.dataset.level = state;
      swatch.setAttribute('aria-hidden', 'true');
      item.append(swatch, name);
      legend.append(item);
    }
    root.append(legend);

    function select(key, focus = false) {
      selected = key;
      const day = model.days.get(key);
      const state = stats.stateFor(day, key, model.since, model.today);
      const message = state === 'active' ? `${duration(day.seconds)} de lecture active` : states[state];
      const sessions = day?.sessions ? ` · ${count(day.sessions)} session${day.sessions > 1 ? 's' : ''}` : '';
      detail.textContent = `${dayName.format(stats.civil(key))} · ${message}${sessions}`;
      for (const cell of grid.querySelectorAll('button')) {
        const active = cell.dataset.date === key;
        cell.tabIndex = active ? 0 : -1;
        cell.setAttribute('aria-pressed', String(active));
        if (active && focus) cell.focus({ preventScroll: true });
      }
    }

    function render() {
      label.textContent = monthName.format(stats.civil(month));
      back.disabled = month <= first;
      ahead.disabled = month >= last;
      grid.replaceChildren();
      for (const day of ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']) grid.append(el('span', day, 'stats-weekday'));
      const pad = (stats.civil(month).getDay() + 6) % 7;
      for (let i = 0; i < pad; i++) grid.append(el('span'));
      const end = stats.shiftMonth(month, 1);
      for (let key = month; key < end; key = stats.shift(key, 1)) {
        const day = model.days.get(key);
        const state = stats.stateFor(day, key, model.since, model.today);
        const active = state === 'active';
        const date = key;
        const cell = button(String(Number(key.slice(-2))), () => select(date, true));
        cell.dataset.date = key;
        cell.dataset.level = active ? 'level' + (1 + thresholds.filter((limit) => day.seconds >= limit).length) : state;
        cell.setAttribute('aria-label', `${dayName.format(stats.civil(key))} · ${active ? duration(day.seconds) : states[state]}`);
        if (key === model.today) cell.setAttribute('aria-current', 'date');
        grid.append(cell);
      }
      select(selected);
    }
    grid.addEventListener('keydown', (event) => {
      if (!event.target.dataset.date) return;
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (delta === undefined) return;
      event.preventDefault();
      const next = stats.shift(selected, delta);
      const period = stats.period(next, 'month');
      if (period < first || period > last) return;
      if (month !== period) { month = period; selected = next; render(); }
      select(next, true);
    });
    render();
  }

  function comparison(model, days) {
    const start = stats.shift(model.today, 1 - days);
    const previousStart = stats.shift(start, -days);
    const previousEnd = stats.shift(start, -1);
    const current = stats.range(model.days, start, model.today).seconds;
    const previous = stats.range(model.days, previousStart, previousEnd).seconds;
    const covered = Array.from({ length: days * 2 }, (_, i) => stats.shift(previousStart, i))
      .every((key) => stats.stateFor(model.days.get(key), key, model.since, model.today) !== 'unknown');
    if (!covered) return `${days} jours · historique incomplet pour la comparaison`;
    return `${days} jours · ${duration(current)} contre ${duration(previous)} sur la période précédente`;
  }

  function chart(parent, model, completions = null) {
    const root = section(parent, 'Évolution');
    const plot = el('div', undefined, 'stats-plot');
    plot.setAttribute('aria-hidden', 'true');
    const table = el('table', undefined, 'stats-table');
    const details = el('details', undefined, 'stats-data');
    details.append(el('summary', 'Consulter les valeurs du graphique'), table);
    const control = el('div', undefined, 'stats-controls');
    let unit = 'day';
    let metric = 'time';
    control.append(field('Regrouper par', [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']], (value) => { unit = value; render(); }));
    if (completions) control.append(field('Indicateur', [['time', 'Temps actif'], ['finished', 'Fins datées']], (value) => { metric = value; render(); }));
    const note = el('p', undefined, 'stats-hint');
    note.setAttribute('role', 'status');
    root.append(control, note, plot, details);

    function render() {
      const bins = stats.trend(model, unit);
      const time = metric === 'time';
      const values = bins.map((bin) => time ? bin.seconds : completions.reduce((n, key) => n + Number(key >= bin.start && key <= bin.end), 0));
      const max = Math.max(1, ...values);
      plot.replaceChildren();
      table.replaceChildren(el('caption', time ? 'Temps actif enregistré' : 'Livres actuellement terminés avec date connue'));
      const header = table.createTHead().insertRow();
      for (const name of ['Période', time ? 'Temps actif' : 'Livres']) {
        const cell = el('th', name);
        cell.scope = 'col';
        header.append(cell);
      }
      const tbody = table.createTBody();
      for (const [index, bin] of bins.entries()) {
        const value = values[index];
        const label = shortDay.format(stats.civil(bin.start));
        const column = el('div', undefined, 'stats-plot-column');
        const track = el('div', undefined, 'stats-plot-track');
        const bar = el('span', undefined, 'stats-plot-bar');
        bar.style.height = `${value ? Math.max(5, (100 * value) / max) : 0}%`;
        track.append(bar);
        column.append(track, el('span', index % 2 === 0 || index === bins.length - 1 ? label : ''));
        plot.append(column);
        const row = tbody.insertRow();
        const labelCell = el('th', unit === 'month' ? monthName.format(stats.civil(bin.start))
          : unit === 'day' ? label : `${label} – ${shortDay.format(stats.civil(bin.end))}`);
        labelCell.scope = 'row';
        row.append(labelCell, el('td', time ? (bin.known ? duration(value) + (bin.complete ? '' : ' · données partielles') : 'Historique inconnu') : count(value)));
      }
      note.textContent = time ? `${comparison(model, 7)}. ${comparison(model, 30)}.`
        : 'Les livres dont la date de fin est inconnue sont absents du graphique. Un changement de statut actualise cette vue.';
    }
    render();
  }

  function recentSessions(parent, model, titles) {
    const root = section(parent, 'Sessions de lecture');
    const summary = el('p', undefined, 'stats-hint');
    summary.setAttribute('role', 'status');
    const list = el('ul', undefined, 'stats-sessions');
    let limit = 12;
    let days = '30';
    const more = button('Voir davantage de sessions', () => { limit += 12; render(); });
    const coverage = model.since ? `${count(model.sessions.length)} au total · depuis le ${dayName.format(stats.civil(model.since))}.`
      : model.sessions.length ? `${count(model.sessions.length)} au total · début du suivi inconnu.`
        : 'Le suivi commence à la prochaine ouverture en lecture.';
    root.append(el('p', coverage, 'stats-hint'),
      field('Période', [['30', '30 derniers jours'], ['7', '7 derniers jours'], ['all', 'Toutes les sessions']], (value) => {
        days = value; limit = 12; render();
      }), summary, list, more);
    root.append(el('p', 'Un geste de lecture démarre le suivi au premier plan. Il s’arrête après trois minutes sans geste ou en quittant le premier plan. Les sessions sont découpées à minuit.', 'stats-hint'));
    function render() {
      const from = days === 'all' ? '' : stats.shift(model.today, 1 - Number(days));
      const items = days === 'all' ? model.sessions : model.sessions.filter((session) => session.date >= from && session.date <= model.today);
      summary.textContent = items.length ? `${count(items.length)} session${items.length > 1 ? 's' : ''} · durée moyenne ${duration(items.reduce((n, session) => n + session.ms, 0) / 1000 / items.length)}`
        : 'Aucune session enregistrée sur cette période.';
      list.replaceChildren(...items.slice(0, limit).map((session) => {
        const item = el('li');
        item.append(el('strong', titles.get(session.bookId) || 'Livre de la bibliothèque'),
          el('span', `${dayName.format(stats.civil(session.date))} · ${duration(session.ms / 1000)}`));
        return item;
      }));
      const focused = document.activeElement === more;
      more.hidden = items.length <= limit;
      if (more.hidden && focused) NC.focus(root.querySelector('select'));
    }
    render();
  }

  function modelOf(snapshot) {
    const today = NC.todayKey();
    return { ...stats.summarize(snapshot.rows, today), since: stats.validDay(snapshot.coverage?.value) ? snapshot.coverage.value : undefined };
  }

  function bookSummary(root, book, snapshot, model) {
    const { meta, progress } = snapshot;
    const status = NC.normStatus(meta?.status);
    const sources = { manual: 'Statut choisi manuellement', epub: 'Fin détectée dans l’EPUB', pdf: 'Dernière page du PDF affichée' };
    const notes = snapshot.annotations.filter((annotation) => NC.isNote(annotation) || (typeof annotation.note === 'string' && annotation.note.trim())).length;
    const marks = snapshot.annotations.filter((annotation) => !NC.isNote(annotation)).length;
    const pct = Number.isFinite(progress?.pct) ? Math.round(Math.max(0, Math.min(1, progress.pct)) * 100) + ' %' : 'Inconnue';
    const position = book.type === 'pdf' && progress?.lastPage ? `${pct === 'Inconnue' ? '' : pct + ' · '}Page ${progress.lastPage} du PDF` : pct;
    const end = status === 'termine' ? dated(meta?.statusAt) : '—';
    cards(root, [['Temps actif enregistré', duration(model.total.seconds)], ['Progression', position], ['Statut', NC.READ_STATUS[status].label],
      ['Première ouverture connue', dated(meta?.firstOpenedAt)], ['Dernière activité mesurée', dated(model.books.get(book.id)?.lastAt)],
      ['Date de fin', end], ['Notes', count(notes)], ['Surlignages', count(marks)], ['Signets', count(snapshot.bookmarks)]]);
    if (status === 'termine') root.append(el('p', sources[meta?.finishSource] || 'Origine du statut terminé inconnue.', 'stats-hint'));
    let streak = 0;
    const active = (date) => model.days.get(date)?.seconds > 0 || model.days.get(date)?.pages > 0;
    let key = active(model.today) ? model.today : stats.shift(model.today, -1);
    while (active(key)) { streak++; key = stats.shift(key, -1); }
    const unit = book.type === 'pdf' ? 'présentations de pages PDF' : 'présentations en mode pages EPUB';
    root.append(el('p', `${count(model.total.pages)} ${unit} · ${count(model.total.days)} jours actifs${streak ? ` · ${count(streak)} jours actifs d’affilée` : ''}.`, 'stats-hint'));
    const day = model.days.get(model.today);
    const seven = stats.range(model.days, stats.shift(model.today, -6), model.today);
    const thirty = stats.range(model.days, stats.shift(model.today, -29), model.today);
    root.append(el('p', `Aujourd’hui ${duration(day?.seconds || 0)} · 7 jours ${duration(seven.seconds)} · 30 jours ${duration(thirty.seconds)}.`, 'stats-hint'));
    root.append(el('p', 'Les présentations comptent des affichages et des retours au même passage. En défilement EPUB, le temps seul est suivi.', 'stats-hint'));
  }

  function goalSection(parent) {
    const root = section(parent, 'Objectif de lecture');
    function render() {
      const restoreFocus = root.contains(document.activeElement);
      root.replaceChildren(el('h3', 'Objectif de lecture'));
      const goal = NC.goal.summary();
      if (goal) {
        root.append(el('p', `${goal.label} · ${count(goal.done)} sur ${count(goal.target)} livres`, 'stats-goal-value'));
        const progress = el('progress');
        progress.max = goal.target;
        progress.value = Math.min(goal.target, goal.done);
        progress.setAttribute('aria-label', 'Progression de l’objectif de lecture');
        root.append(progress);
        root.append(el('p', `${shortDay.format(stats.civil(goal.start))} – ${dayName.format(stats.civil(goal.end))}${goal.pace ? ' · ' + goal.pace : ''}`, 'stats-hint'));
        if (goal.undated) root.append(el('p', 'Les livres terminés sans date connue sont hors de la période mesurable.', 'stats-hint'));
        if (goal.finished.length) {
          const history = el('details', undefined, 'stats-data');
          const list = el('ol', undefined, 'stats-sessions');
          const perDay = new Map();
          for (const book of goal.finished) perDay.set(book.date, (perDay.get(book.date) || 0) + 1);
          let total = 0;
          for (const [date, books] of [...perDay].sort()) {
            total += books;
            list.append(el('li', `${shortDay.format(stats.civil(date))} · ${count(total)} sur ${count(goal.target)}`));
          }
          history.append(el('summary', 'Voir la progression au fil de la période'), list);
          root.append(history);
        }
      } else root.append(el('p', 'Vous pouvez choisir un nombre de livres à terminer au cours d’une période.', 'stats-hint'));
      const control = button(goal ? 'Gérer l’objectif' : 'Définir un objectif', () => NC.goal.open());
      root.append(control);
      if (restoreFocus) NC.focus(control);
    }
    render();
    return render;
  }

  function distribution(parent, model, titles) {
    const ordered = [...model.books].filter(([, row]) => row.seconds > 0).sort((a, b) => b[1].seconds - a[1].seconds);
    if (!ordered.length) return;
    const root = section(parent, 'Temps par livre');
    const rows = el('ul', undefined, 'stats-sessions');
    for (const [id, data] of ordered.slice(0, 5)) {
      const item = el('li');
      item.append(el('strong', titles.get(id) || 'Livre de la bibliothèque'), el('span', duration(data.seconds)));
      rows.append(item);
    }
    if (ordered.length > 5) rows.append(el('li', `Autres livres · ${duration(ordered.slice(5).reduce((sum, [, row]) => sum + row.seconds, 0))}`));
    root.append(rows);
  }

  async function render(target, book, isCurrent, saved) {
    target.replaceChildren(el('p', 'Chargement de l’activité…', 'stats-hint'));
    target.setAttribute('aria-busy', 'true');
    try {
      await saved;
      const snapshot = await NC.db.readingStatsSnapshot(book?.id);
      if (!isCurrent()) return;
      if (book && snapshot.ids === undefined) { target.replaceChildren(el('p', 'Ce livre a été retiré de la bibliothèque.')); return; }
      const available = new Set(book ? [book.id] : snapshot.ids);
      snapshot.rows = snapshot.rows.filter((row) => available.has(row.bookId));
      const model = modelOf(snapshot);
      const books = book ? [book] : NC.library.notebookBooks();
      const titles = new Map(books.map(({ id, title }) => [id, title]));
      target.replaceChildren();
      if (book) bookSummary(target, book, snapshot, model);
      else {
        const finished = snapshot.meta.filter((row) => available.has(row.id) && row.status === 'termine');
        const reading = snapshot.meta.filter((row) => available.has(row.id) && row.status === 'encours');
        const recent = (days) => stats.range(model.days, stats.shift(model.today, 1 - days), model.today);
        cards(target, [['Temps actif enregistré', duration(model.total.seconds)], ['7 derniers jours', duration(recent(7).seconds)],
          ['30 derniers jours', duration(recent(30).seconds)], ['Livres terminés', count(finished.length)],
          ['Livres en cours', count(reading.length)], ['Jours actifs', count(model.total.days)]]);
        const ends = finished.filter((row) => stats.positive(row.statusAt)).map((row) => row.statusDay || NC.dateKey(row.statusAt));
        target.append(el('p', model.days.size ? 'Les durées additionnent l’activité enregistrée. Le temps ancien est disponible sans détail par session.'
          : 'L’activité apparaît lorsque vous interagissez avec un livre au premier plan.', 'stats-hint'));
        calendar(target, model);
        chart(target, model, ends);
        refreshGoal = goalSection(target);
        distribution(target, model, titles);
      }
      if (book) {
        if (target.id === 'drawer-body') target.append(button('Activité de toute la bibliothèque', () => open()));
        calendar(target, model);
        chart(target, model);
      }
      recentSessions(target, model, titles);
    } catch (error) {
      if (isCurrent()) target.replaceChildren(el('p', 'L’activité n’a pas pu être affichée. Rouvrez les statistiques pour réessayer.'));
    } finally { if (isCurrent()) target.removeAttribute('aria-busy'); }
  }

  let generation = 0;
  let refreshGoal;
  const panel = () => $('#stats-pop');
  const close = () => { generation++; refreshGoal = null; NC.modal.hide(panel()); };
  function open(book, opener) {
    const gen = ++generation;
    $('#stats-pop-title').textContent = book ? book.title : 'Activité de lecture';
    NC.modal.show(panel(), { backdrop: $('#stats-backdrop'), initial: $('#stats-close'), dismiss: close, opener,
      fallback: () => $('#btn-reading-stats') });
    panel().scrollTop = 0;
    render($('#stats-pop-body'), book, () => gen === generation && !panel().hidden);
  }

  function init() {
    $('#btn-reading-stats').addEventListener('click', () => open());
    $('#stats-close').addEventListener('click', close);
    $('#stats-backdrop').addEventListener('click', close);
  }

  return { init, open, renderBook: render, refreshGoal: () => refreshGoal?.() };
})();
