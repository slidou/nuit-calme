/* NUIT CALME — notes, surlignages et signets de la bibliothèque. */
'use strict';

NC.notebook = (() => {
  const $ = NC.$;
  const labels = { note: 'Note personnelle', highlight: 'Surlignage', bookmark: 'Signet' };
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  const batch = 40;
  const metadataChanges = new Map();
  const cardButtons = new Map();
  let entries = [];
  let results = [];
  let rendered = 0;
  let loading = false;
  let generation = 0;
  let filterTimer;
  let refreshTimer;
  let detail = null;
  let saving = false;
  let returnScroll = 0;
  let libraryDirty = false;

  const text = (value) => (typeof value === 'string' && value.trim()) ? value : '';
  const bookKey = (id) => JSON.stringify(id) ?? 'null';
  const isVisible = () => !$('#view-notebook').hidden;

  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value) node.textContent = value;
    return node;
  }

  function validDate(value) {
    return Number.isFinite(value) && value > 0 && Number.isFinite(new Date(value).getTime()) ? value : null;
  }

  function describe(row, bookmark, books, present) {
    const available = present.has(row.bookId);
    const book = available && books.get(row.bookId);
    const savedTitle = text(book?.title);
    const title = savedTitle || (available ? 'Titre indisponible' : 'Livre indisponible');
    const author = text(book?.author);
    const note = bookmark ? '' : text(row.note);
    const quote = bookmark ? '' : text(row.text);
    const type = bookmark ? 'bookmark' : note || NC.isNote(row) ? 'note' : 'highlight';
    const color = !bookmark && Object.hasOwn(NC.HIGHLIGHT_COLORS, row.color) ? row.color : '';
    const updated = validDate(row.updatedAt);
    const date = updated || validDate(row.createdAt);
    let location = '';
    if (Number.isInteger(row.page) && row.page > 0) {
      location = 'Page ' + row.page;
    } else if (bookmark && text(row.label) && row.label !== 'Passage') {
      location = row.label;
    } else if (Number.isInteger(row.sectionIndex) && row.sectionIndex >= 0) {
      location = 'Section ' + (row.sectionIndex + 1);
    }
    const target = Number.isInteger(row.page) && row.page > 0 ||
      Number.isInteger(row.sectionIndex) && row.sectionIndex >= 0 || !!text(row.cfi);
    return { key: JSON.stringify([bookmark, row.id]), row, title, author, note, quote, type, color,
      updated, date, location, target, available,
      search: [savedTitle, author, quote, note, location].map(NC.foldText) };
  }

  async function refresh() {
    const request = ++generation;
    if (!entries.length) {
      loading = true;
      $('#notebook-status').textContent = 'Chargement du carnet…';
    }
    try {
      const { bookIds, annotations, bookmarks } = await NC.db.notebookSnapshot();
      if (request !== generation || !isVisible()) return;
      const books = new Map(NC.library.notebookBooks().map((book) => [book.id, book]));
      for (const [id, book] of metadataChanges) {
        if (book) books.set(id, book);
        else books.delete(id);
      }
      const present = new Set(bookIds);
      const model = [];
      for (const [rows, isBookmark] of [[annotations, false], [bookmarks, true]]) {
        for (let i = 0; i < rows.length; i++) {
          model.push(describe(rows[i], isBookmark, books, present));
          if (i % 250 === 249) {
            await NC.tick();
            if (request !== generation || !isVisible()) return;
          }
        }
      }
      entries = model;
      loading = false;
      updateBookOptions();
      applyFilters({ keepCount: true });
    } catch (error) {
      if (request !== generation || !isVisible()) return;
      loading = false;
      console.warn('Lecture du carnet', error);
      $('#notebook-status').textContent = 'Le carnet n’a pas pu être chargé.';
      emptyState('Lecture interrompue', 'Vous pouvez réessayer la lecture de vos entrées.', true);
    }
  }

  function refreshIfVisible() {
    if (!isVisible()) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 55);
  }

  function updateBookOptions() {
    const select = $('#notebook-book');
    const selected = select.value;
    const previousLabel = select.selectedOptions[0]?.textContent;
    const books = new Map(entries.map((entry) => [bookKey(entry.row.bookId), entry]));
    const items = [...books].sort(([, a], [, b]) => collator.compare(a.title, b.title));
    const options = [new Option('Tous les livres', '')];
    for (const [key, entry] of items) {
      options.push(new Option([entry.title, entry.author].filter(Boolean).join(' · '), key));
    }
    if (selected && !books.has(selected)) options.push(new Option(previousLabel, selected));
    select.replaceChildren(...options);
    select.value = selected;
  }

  function emptyState(title, message, retry = false) {
    $('#notebook-empty-title').textContent = title;
    $('#notebook-empty-text').textContent = message;
    $('#notebook-empty').hidden = false;
    $('#notebook-retry').hidden = !retry;
  }

  function applyFilters({ keepCount = false, restoreKey = null } = {}) {
    if (loading) return;
    const words = NC.foldText($('#notebook-search').value).trim().split(/\s+/).filter(Boolean);
    const book = $('#notebook-book').value;
    const type = $('#notebook-type').value;
    const color = $('#notebook-color').value;
    const period = $('#notebook-date').value;
    const order = $('#notebook-sort').value;
    const filtered = !!(words.length || book || type || color || period);
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1).getTime();
    const startOfNextYear = new Date(today.getFullYear() + 1, 0, 1).getTime();
    const recent = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29).getTime();
    const activeCard = document.activeElement?.closest('.notebook-card');
    const focusKey = restoreKey ?? activeCard?.dataset.entry;
    const limit = keepCount ? Math.max(batch, rendered) : batch;
    results = entries.filter((entry) =>
      (!book || bookKey(entry.row.bookId) === book) &&
      (!type || (type === 'quote' ? !!entry.quote : entry.type === type)) &&
      (!color || entry.color === color) &&
      (!period || (period === 'unknown' ? entry.date === null :
        period === 'year' ? entry.date >= startOfYear && entry.date < startOfNextYear :
          entry.date >= recent && entry.date <= today.getTime())) &&
      words.every((word) => entry.search.some((field) => field.includes(word))));
    results.sort((a, b) => {
      if (order === 'book') {
        const byTitle = collator.compare(a.title, b.title) || collator.compare(a.author, b.author);
        if (byTitle) return byTitle;
      }
      if (a.date === null) return b.date === null ? 0 : 1;
      if (b.date === null) return -1;
      return order === 'old' ? a.date - b.date : b.date - a.date;
    });

    $('#notebook-results').replaceChildren();
    cardButtons.clear();
    rendered = 0;
    $('#notebook-status').textContent = `${results.length} entrée${results.length === 1 ? '' : 's'}` +
      (filtered ? ` sur ${entries.length}` : '');
    $('#notebook-reset').hidden = !filtered;
    $('#notebook-export').disabled = !entries.length;
    $('#notebook-export-filtered').disabled = !results.length;
    $('#notebook-empty').hidden = !!results.length;
    if (!results.length) {
      if (!entries.length) emptyState('Votre carnet attend ses premiers passages',
        'Dans un livre, sélectionnez un passage pour le souligner ou ajouter une note. Les signets posés dans le lecteur apparaissent aussi ici.');
      else emptyState('Aucune entrée trouvée', 'Essayez une recherche plus courte ou élargissez les filtres.');
    }
    appendEntries(limit);
    if (focusKey) NC.focus(cardButtons.get(focusKey), $('#notebook-search'));
  }

  function addMeta(target, entry) {
    target.replaceChildren(element('span', labels[entry.type], 'notebook-kind'));
    if (entry.color) {
      const { hex, label } = NC.HIGHLIGHT_COLORS[entry.color];
      const swatch = element('span', label, 'notebook-color');
      swatch.style.setProperty('--notebook-swatch', hex);
      target.append(swatch);
    }
    if (entry.date) {
      const date = element('time', (entry.updated ? 'Modifié le ' : '') + NC.fmtDate(entry.date));
      date.dateTime = new Date(entry.date).toISOString();
      target.append(date);
    }
  }

  function addExcerpt(container, label, value, tag) {
    if (!value) return;
    const group = element('section', '', 'notebook-fragment');
    group.append(element('h3', label), element(tag, value));
    container.append(group);
  }

  function addContent(container, entry) {
    addExcerpt(container, 'Citation', entry.quote, 'blockquote');
    addExcerpt(container, 'Note personnelle', entry.note, 'p');
    if (entry.location) container.append(element('p', entry.location, 'notebook-location'));
  }

  function makeButton(label, className, action) {
    const button = element('button', label, className);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
  }

  function createCard(entry) {
    const card = element('article', '', 'notebook-card');
    card.dataset.entry = entry.key;
    const info = element('div', '', 'notebook-eyebrow');
    addMeta(info, entry);
    card.append(info, element('h2', entry.title));
    if (entry.author) card.append(element('p', entry.author, 'notebook-author'));
    addContent(card, entry);
    const actions = element('div', '', 'notebook-entry-actions');
    const consult = makeButton('Consulter', 'mini-btn', () => openDetail(entry));
    consult.setAttribute('aria-label', `Consulter · ${entry.title}`);
    actions.append(consult);
    const link = entry.available && makeButton(entry.target ? 'Aller au passage' : 'Ouvrir le livre',
      'mini-btn notebook-primary', () => visit(entry));
    if (link) {
      link.setAttribute('aria-label', [link.textContent, entry.title, entry.location].filter(Boolean).join(' · '));
      actions.prepend(link);
    }
    cardButtons.set(entry.key, link || consult);
    card.append(actions);
    return card;
  }

  function appendEntries(count) {
    const fragment = document.createDocumentFragment();
    const end = Math.min(results.length, rendered + count);
    for (; rendered < end; rendered++) fragment.append(createCard(results[rendered]));
    $('#notebook-results').append(fragment);
    const more = $('#notebook-more');
    more.hidden = rendered >= results.length;
    if (!more.hidden) {
      const remaining = Math.min(batch, results.length - rendered);
      more.textContent = `Afficher ${remaining} entrée${remaining === 1 ? '' : 's'} de plus`;
    }
  }

  function openDetail(entry) {
    detail = entry;
    $('#notebook-entry-title').textContent = entry.title;
    $('#notebook-entry-author').textContent = entry.author;
    $('#notebook-entry-author').hidden = !entry.author;
    addMeta($('#notebook-entry-meta'), entry);
    const content = $('#notebook-entry-content');
    content.replaceChildren();
    addContent(content, entry);
    $('#notebook-note').value = entry.note;
    $('#notebook-note-field').hidden = true;
    $('#notebook-entry-save').hidden = true;
    $('#notebook-entry-edit').hidden = entry.type !== 'note';
    $('#notebook-delete-confirm').hidden = true;
    $('#notebook-entry-error').hidden = true;
    NC.modal.show($('#notebook-entry'), {
      backdrop: $('#notebook-backdrop'),
      initial: $('#notebook-entry-title'),
      fallback: () => cardButtons.get(entry.key) || $('#notebook-search'),
      dismiss: () => $('#notebook-delete-confirm').hidden ? closeDetail() : cancelDelete(),
    });
  }

  function closeDetail() {
    if (saving) return;
    detail = null;
    NC.modal.hide($('#notebook-entry'));
  }

  function showError(message) {
    const error = $('#notebook-entry-error');
    error.hidden = false;
    error.textContent = message;
  }

  function confirmDelete() {
    $('#notebook-delete-confirm').hidden = false;
    NC.focus($('#notebook-delete-cancel'));
  }

  function cancelDelete() {
    $('#notebook-delete-confirm').hidden = true;
    NC.focus($('#notebook-entry-delete'));
  }

  function setSaving(value) {
    saving = value;
    NC.$$('#notebook-entry button').forEach((button) => { button.disabled = value; });
  }

  async function changeEntry(remove) {
    if (!detail || saving) return;
    const entry = detail;
    const note = $('#notebook-note').value.trim();
    if (!remove && !note) { showError('Écrivez une note avant de l’enregistrer.'); return; }
    setSaving(true);
    try {
      const row = remove ? await (entry.type === 'bookmark'
        ? NC.db.deleteBookmark(entry.row.id, entry.row.bookId, entry.row)
        : NC.db.deleteAnnotation(entry.row.id, entry.row.bookId, entry.row))
        : await NC.db.patchAnnotation(entry.row.id, { note, updatedAt: Date.now() },
          entry.row.bookId, { note: entry.row.note });
      if (!row) {
        showError('Cette entrée a déjà été supprimée. Fermez cette fenêtre pour actualiser la liste.');
        return;
      }
      setSaving(false);
      closeDetail();
      NC.toast(remove ? 'Entrée supprimée.' : 'Note enregistrée.', 'success');
      refreshIfVisible();
    } catch (error) {
      showError(error.name === 'InvalidStateError'
        ? 'Cette entrée a changé. Fermez cette fenêtre puis rouvrez-la pour voir la dernière version.'
        : 'L’opération a échoué. Vous pouvez réessayer.');
    } finally {
      setSaving(false);
      if (detail === entry) NC.focus(remove ? $('#notebook-delete-cancel') : $('#notebook-note'));
    }
  }

  async function visit(entry) {
    returnScroll = $('#view-notebook').scrollTop;
    await NC.reader.open(entry.row.bookId, { key: entry.key, target: entry.target ? entry.row : null });
  }

  const markdownEscape = (value) => String(value).replace(/[\\`*_{}\[\]()#+\-.!|>~<&]/g, '\\$&');
  function markdownBlock(value) {
    return value.split(/\r\n?|\n/).map((line) => line.length ? '> ' + markdownEscape(line) + '  ' : '>').join('\n');
  }

  async function exportMarkdown(filtered) {
    if (filtered && filterTimer) {
      clearTimeout(filterTimer);
      filterTimer = null;
      applyFilters({ keepCount: true });
    }
    const selection = filtered ? results : entries;
    if (!selection.length) return;
    const books = new Map();
    const lines = ['# Carnet de Nuit Calme', ''];
    for (const entry of selection) {
      const id = entry.row.bookId;
      if (!books.has(id)) books.set(id, []);
      books.get(id).push(entry);
    }
    let written = 0;
    for (const group of books.values()) {
      const { title, author } = group[0];
      lines.push('## ' + markdownEscape(title.replace(/[\r\n]/g, ' ')), '');
      if (author) lines.push('Auteur · ' + markdownEscape(author.replace(/[\r\n]/g, ' ')), '');
      for (const entry of group) {
        const details = [entry.location, entry.date && NC.fmtDate(entry.date)].filter(Boolean);
        lines.push('### ' + labels[entry.type], '');
        if (details.length) lines.push(markdownEscape(details.join(' · ').replace(/[\r\n]/g, ' ')), '');
        if (entry.quote) lines.push('#### Citation', '', markdownBlock(entry.quote), '');
        if (entry.note) lines.push('#### Note personnelle', '', markdownBlock(entry.note), '');
        if (++written % 250 === 0) await NC.tick();
      }
    }
    NC.downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }),
      filtered ? 'nuit-calme-carnet-resultats.md' : 'nuit-calme-carnet.md');
  }

  function open() {
    $('#view-library').hidden = true;
    $('#view-notebook').hidden = false;
    NC.focus($('#notebook-title'));
    refresh();
  }

  async function resume(key) {
    $('#view-notebook').hidden = false;
    await refresh();
    if (!isVisible()) return;
    $('#view-notebook').scrollTop = returnScroll;
    NC.focus(cardButtons.get(key), $('#notebook-search'));
  }

  function close() {
    generation++;
    $('#view-notebook').hidden = true;
    $('#view-library').hidden = false;
    NC.focus($('#btn-notebook'));
    if (libraryDirty) {
      libraryDirty = false;
      NC.library.refresh().catch((error) => console.warn('Actualisation de la bibliothèque', error));
    }
  }

  function init() {
    const onClick = (id, handler) => $(id).addEventListener('click', handler);
    onClick('#btn-notebook', open);
    onClick('#notebook-back', close);
    onClick('#notebook-retry', refresh);
    onClick('#notebook-more', () => {
      const next = results[rendered];
      appendEntries(batch);
      NC.focus(next && cardButtons.get(next.key));
    });
    onClick('#notebook-export', () => exportMarkdown(false));
    onClick('#notebook-export-filtered', () => exportMarkdown(true));
    onClick('#notebook-entry-close', closeDetail);
    onClick('#notebook-backdrop', closeDetail);
    onClick('#notebook-entry-edit', () => {
      $('#notebook-note-field').hidden = false;
      $('#notebook-entry-save').hidden = false;
      $('#notebook-entry-edit').hidden = true;
      $('#notebook-note').focus();
    });
    onClick('#notebook-entry-save', () => changeEntry(false));
    onClick('#notebook-entry-delete', confirmDelete);
    onClick('#notebook-delete-cancel', cancelDelete);
    onClick('#notebook-delete-accept', () => changeEntry(true));
    const filters = ['#notebook-book', '#notebook-type', '#notebook-color', '#notebook-date', '#notebook-sort'];
    for (const selector of filters) $(selector).addEventListener('change', () => applyFilters());
    for (const [key, color] of Object.entries(NC.HIGHLIGHT_COLORS)) {
      $('#notebook-color').add(new Option(color.label, key));
    }
    $('#notebook-search').addEventListener('input', () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        filterTimer = null;
        applyFilters();
      }, 100);
    });
    onClick('#notebook-reset', () => {
      for (const selector of ['#notebook-search', ...filters.slice(0, -1)]) $(selector).value = '';
      applyFilters();
      NC.focus($('#notebook-search'));
    });
    NC.db.onNotebookChange((change) => {
      if (change.replace) metadataChanges.clear();
      for (const book of change.books || []) metadataChanges.set(book.id, book);
      if ('deleted' in change) metadataChanges.set(change.deleted, null);
      if ($('#view-library').hidden && (change.books || 'deleted' in change)) libraryDirty = true;
      refreshIfVisible();
    });
    NC.db.onCatalogChange(() => { if ($('#view-library').hidden) libraryDirty = true; });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshIfVisible();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isVisible()) close();
    });
  }

  return { init, resume, refreshIfVisible };
})();
