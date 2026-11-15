/* NUIT CALME — objectif de lecture (V2.24).
   Un cap qu'on se choisit : N livres à finir en X temps. L'objectif
   vit dans le localStorage (comme les filtres et le tri — c'est un
   réglage personnel, pas une donnée de livre) ; le compte, lui, est
   relu dans la bibliothèque à chaque rendu : un livre compte quand sa
   fiche passe « Terminé » pendant la période — à la main, ou tout
   seul quand la fin du livre est atteinte (V2.14).

   L'échéance se pose au choix : cette année civile, ce mois-ci, une
   durée (1 semaine à 1 an, à partir d'aujourd'hui) ou une date
   précise. La bannière de la bibliothèque suit la progression —
   barre dorée, badge d'état, allure conseillée — et la modale détaille
   tout : période, temps restant, livres comptés avec leur date.

   Dates : tout est au niveau du JOUR, en heure locale — les presets
   « cette année » / « ce mois-ci » partent du 1er janvier / du 1er du
   mois (les livres déjà finis depuis comptent, à la Goodreads), les
   durées partent d'aujourd'hui. Les livres « Terminé » d'avant la
   V2.24 n'ont pas de date dédiée : leur dernière touche à la fiche
   (updatedAt) fait office de date de fin, au mieux. */
'use strict';

NC.goal = (() => {
  const LS_KEY = 'nc.reading-goal';
  const DAY = 86400000;

  let goal = null;          // { target, start, end, createdAt, celebrated }
  let mode = 'view';        // 'view' (fiche) | 'form' (réglage)
  let confirmRemove = false;

  /* ── Jours : clés « YYYY-MM-DD » en heure locale, jamais UTC ── */
  const parseDay = (key) => {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const keyOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
  const todayKey = () => keyOf(new Date());
  const dayDiff = (a, b) => Math.round((parseDay(a) - parseDay(b)) / DAY);
  const shiftDays = (key, n) => keyOf(new Date(parseDay(key).getTime() + n * DAY));
  /* Fin de journée inclusive : un livre fini le dernier jour compte. */
  const endOf = (key) => {
    const d = parseDay(key);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  };
  /* Décalage d'un nombre de mois, à jour fixé (31 janv. + 1 mois → 28/29 févr.). */
  const shiftMonths = (key, n) => {
    const d = parseDay(key);
    const m = d.getMonth() + n;
    const dim = new Date(d.getFullYear(), m + 1, 0).getDate();
    return keyOf(new Date(d.getFullYear(), m, Math.min(d.getDate(), dim)));
  };

  const pl = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');

  /* ── Échéances proposées ──
     annee/mois : périodes calendaires (le compte reprend les livres
     déjà finis dedans) ; durées : à partir d'aujourd'hui, dernier jour
     compris ; date : libre, pas avant aujourd'hui. */
  const PERIODS = [
    { key: 'annee', label: 'Cette année' },
    { key: 'mois',  label: 'Ce mois-ci' },
    { key: 's1',    label: 'En 1 semaine' },
    { key: 's2',    label: 'En 2 semaines' },
    { key: 'm1',    label: 'En 1 mois' },
    { key: 'm3',    label: 'En 3 mois' },
    { key: 'm6',    label: 'En 6 mois' },
    { key: 'a1',    label: 'En 1 an' },
    { key: 'date',  label: 'Jusqu\u2019à une date précise' },
  ];

  function periodRange(key, fromKey, dateChoice) {
    switch (key) {
      case 'annee': {
        const y = fromKey.slice(0, 4);
        return { start: y + '-01-01', end: y + '-12-31' };
      }
      case 'mois': {
        const d = parseDay(fromKey);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return { start: keyOf(new Date(d.getFullYear(), d.getMonth(), 1)), end: keyOf(last) };
      }
      case 's1': return { start: fromKey, end: shiftDays(fromKey, 6) };
      case 's2': return { start: fromKey, end: shiftDays(fromKey, 13) };
      /* « En 1 mois » d'aujourd'hui à la veille de la même date :
         le dernier jour compte, la durée promise est la vraie. */
      case 'm1': return { start: fromKey, end: shiftDays(shiftMonths(fromKey, 1), -1) };
      case 'm3': return { start: fromKey, end: shiftDays(shiftMonths(fromKey, 3), -1) };
      case 'm6': return { start: fromKey, end: shiftDays(shiftMonths(fromKey, 6), -1) };
      case 'a1': return { start: fromKey, end: shiftDays(shiftMonths(fromKey, 12), -1) };
      case 'date': {
        const end = (dateChoice && dateChoice >= fromKey) ? dateChoice : fromKey;
        return { start: fromKey, end };
      }
      default: return { start: fromKey, end: shiftDays(fromKey, 6) };
    }
  }

  /* ── Stockage local : chargé à chaque rendu (source unique, aucune
     copie en mémoire qui pourrait vieillir entre deux onglets). ── */
  function load() {
    goal = null;
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (raw && typeof raw === 'object'
          && Number.isFinite(raw.target) && raw.target >= 1
          && /^\d{4}-\d{2}-\d{2}$/.test(raw.start || '')
          && /^\d{4}-\d{2}-\d{2}$/.test(raw.end || '')
          && dayDiff(raw.end, raw.start) >= 0) {
        goal = {
          target: Math.min(999, Math.floor(raw.target)),
          start: raw.start, end: raw.end,
          createdAt: Number(raw.createdAt) || Date.now(),
          celebrated: !!raw.celebrated,
        };
      }
    } catch (e) { /* stockage indisponible : pas d'objectif */ }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(goal)); } catch (e) { /* tant pis */ }
  }

  /* ── Instantané : le compte du moment ──
     Un livre compte quand sa fiche dit « Terminé » avec une date
     connue (statusAt posé par la V2.24, repli updatedAt pour les
     anciens) tombée DANS la période. Hors période : jamais compté. */
  function snapshot() {
    if (!goal) return null;
    const tKey = todayKey();
    const started = dayDiff(tKey, goal.start) >= 0;
    const expired = dayDiff(tKey, goal.end) > 0;
    const finished = (NC.library.finishedBooks ? NC.library.finishedBooks() : [])
      .filter((f) => f.at >= parseDay(goal.start).getTime() && f.at <= endOf(goal.end));
    const done = finished.length;
    const totalDays = dayDiff(goal.end, goal.start) + 1;
    const elapsed = started ? Math.min(totalDays, dayDiff(tKey, goal.start) + 1) : 0;
    const daysLeft = expired ? 0 : dayDiff(goal.end, tKey) + 1; // aujourd'hui compte
    const remainingBooks = Math.max(0, goal.target - done);
    let state;
    if (expired) state = done >= goal.target ? 'atteint' : 'echu';
    else if (done >= goal.target) state = 'atteint';
    else if (!started) state = 'avenir';
    else {
      const d = done / goal.target - elapsed / totalDays;
      state = d >= 0.1 ? 'avance' : d <= -0.15 ? 'retard' : 'ok';
    }
    return { done, finished, totalDays, elapsed, daysLeft, remainingBooks, started, expired, state };
  }

  const STATE_LABEL = {
    atteint: 'Objectif atteint', avance: 'En avance', ok: 'Dans les temps',
    retard: 'Un peu de retard', echu: 'Temps écoulé', avenir: 'À venir',
  };

  /* ── Allure conseillée : ce qu'il reste, rapport au temps restant. ── */
  const fmtNum = (n) => {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
  };
  function fmtPace(remainingBooks, daysLeft) {
    if (remainingBooks <= 0 || daysLeft <= 0) return '';
    const perDay = remainingBooks / daysLeft;
    if (perDay >= 1) return `≈ ${fmtNum(perDay)} ${perDay >= 2 ? 'livres' : 'livre'} par jour`;
    const dpb = daysLeft / remainingBooks;
    if (dpb >= 45) {
      const m = Math.round(dpb / 30.437);
      return m <= 1 ? '≈ 1 livre par mois' : `≈ 1 livre tous les ${m} mois`;
    }
    if (dpb >= 10.5) {
      const w = Math.round(dpb / 7);
      return w <= 1 ? '≈ 1 livre par semaine' : `≈ 1 livre toutes les ${w} semaines`;
    }
    const d = Math.round(dpb);
    return d <= 1 ? '≈ 1 livre par jour' : `≈ 1 livre tous les ${d} jours`;
  }
  const fmtDays = (n) => (n === 1 ? '1 jour' : n + ' jours');

  /* « 1er janvier » : le français met un « er » au premier du mois —
     toLocaleDateString tout seul ne le fait pas. */
  const fmtLong = (key, withYear) => {
    try {
      const d = parseDay(key);
      const day = d.getDate() === 1 ? '1er' : String(d.getDate());
      const mo = d.toLocaleDateString('fr-FR', { month: 'long' })
        + (withYear ? ' ' + d.getFullYear() : '');
      return day + ' ' + mo;
    } catch (e) { return key; }
  };
  const sameMonth = (a, b) => a.slice(0, 7) === b.slice(0, 7);
  function fmtPeriod(startKey, endKey) {
    if (startKey === endKey) return 'le ' + fmtLong(startKey, true);
    const yr = parseDay(endKey).getFullYear() !== new Date().getFullYear();
    const d0 = parseDay(startKey).getDate();
    if (sameMonth(startKey, endKey)) return `du ${d0 === 1 ? '1er' : d0} au ${fmtLong(endKey, yr)}`;
    return `du ${fmtLong(startKey, false)} au ${fmtLong(endKey, yr)}`;
  }

  /* ── Bannière de la bibliothèque ──
     Fantôme (tirets, discret) tant qu'aucun objectif n'est posé ;
     carte de progression une fois le cap choisi. Invisible quand la
     bibliothèque est vide — l'état vide a déjà son mot à dire. */
  const ICON_TARGET = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function makeBanner() {
    const card = document.createElement('div');
    card.className = goal ? 'goal-card' : 'goal-ghost';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-label', goal
      ? 'Objectif de lecture — ouvrir le détail'
      : 'Objectif de lecture — s\u2019en fixer un');
    if (!goal) {
      card.innerHTML =
        ICON_TARGET +
        '<span class="gg-t">Objectif de lecture — se fixer un cap&nbsp;: 12 livres en 3 mois, ou ce que vous voulez.</span>' +
        '<span class="gg-a">Définir</span>';
      return card;
    }
    const s = snapshot();
    if (!s) return card;
    const pct = Math.min(100, Math.round((s.done / goal.target) * 100));
    const head = document.createElement('div');
    head.className = 'goal-head';
    head.innerHTML =
      '<span class="goal-ic">' + ICON_MOON + '</span>' +
      '<span class="goal-title">Objectif de lecture</span>' +
      `<span class="goal-badge ${s.state}">${STATE_LABEL[s.state]}</span>`;
    const mid = document.createElement('div');
    mid.className = 'goal-mid';
    mid.innerHTML =
      `<span class="goal-count"><b>${s.done}</b> / ${goal.target}<i>livres</i></span>` +
      '<span class="goal-bar"><span class="goal-fill" style="width:' + pct + '%"></span></span>' +
      `<span class="goal-pct">${pct} %</span>`;
    const sub = document.createElement('div');
    sub.className = 'goal-sub';
    sub.innerHTML = subLine(s);
    card.append(head, mid, sub);
    return card;
  }

  function subLine(s) {
    if (s.state === 'atteint') {
      return s.expired
        ? `<b>${pl(goal.target, 'livre')}</b> terminé${goal.target > 1 ? 's' : ''} — objectif rempli dans les temps`
        : `<b>${pl(goal.target, 'livre')}</b> terminé${goal.target > 1 ? 's' : ''} — objectif rempli`;
    }
    if (s.state === 'echu') {
      return `Temps écoulé ${fmtPeriod(goal.start, goal.end)} — <b>${s.done}</b> sur ${goal.target} terminé${s.done > 1 ? 's' : ''}`;
    }
    if (s.state === 'avenir') return `Commence ${fmtLong(goal.start, false)}`;
    const bits = [];
    if (s.remainingBooks > 0) bits.push(`Encore <b>${pl(s.remainingBooks, 'livre')}</b>`);
    bits.push(s.daysLeft === 1 ? 'dernier jour' : `<b>${fmtDays(s.daysLeft)}</b> restants`);
    const pace = fmtPace(s.remainingBooks, s.daysLeft);
    if (pace) bits.push(pace);
    return bits.join(' · ');
  }

  function renderBanner() {
    const el = NC.$('#goal-banner');
    if (!el) return;
    const hasBooks = !!(NC.library.count && NC.library.count() > 0);
    el.hidden = !hasBooks;
    el.innerHTML = '';
    if (!hasBooks) return;
    el.appendChild(makeBanner());
  }

  /* ── Modale ──
     Vue « fiche » : gros compte, barre, période, temps restant, allure,
     liste des livres comptés — puis Modifier / Retirer.
     Vue « formulaire » : nombre de livres + échéance, avec la période
     recalculée sous les yeux au fil du choix. */
  function renderModal() {
    const pop = NC.$('#goal-pop');
    if (!pop || pop.hidden) return;
    pop.innerHTML = '';
    if (mode === 'form') pop.appendChild(formView());
    else pop.appendChild(detailView());
  }

  function detailView() {
    const s = snapshot();
    const frag = document.createDocumentFragment();
    const h = document.createElement('h4');
    h.id = 'goal-pop-title';
    h.textContent = 'Objectif de lecture';
    frag.appendChild(h);

    if (!goal || !s) { // rien à montrer : retour au formulaire
      mode = 'form';
      return formView();
    }

    const big = document.createElement('div');
    big.className = 'goal-big';
    big.innerHTML =
      `<span class="goal-big-n">${s.done}</span><span class="goal-big-d"> / ${goal.target} ${pl(goal.target, 'livre').replace(/^\d+ /, '')}</span>`;
    const pct = Math.min(100, Math.round((s.done / goal.target) * 100));
    const bar = document.createElement('div');
    bar.className = 'goal-bar big';
    bar.innerHTML = '<span class="goal-fill" style="width:' + pct + '%"></span>';

    const line = document.createElement('p');
    line.className = 'goal-state-line';
    line.innerHTML = `<span class="goal-badge ${s.state}">${STATE_LABEL[s.state]}</span> <span class="goal-per">${fmtPeriod(goal.start, goal.end)}</span>`;

    const rows = document.createElement('div');
    rows.className = 'goal-rows';
    const row = (lab, val) => {
      const r = document.createElement('div');
      r.className = 'goal-row';
      r.innerHTML = `<span>${lab}</span><b>${val}</b>`;
      return r;
    };
    rows.appendChild(row('Période', fmtPeriod(goal.start, goal.end)));
    if (s.expired) rows.appendChild(row('Terminée le', fmtLong(goal.end, true)));
    else if (s.state !== 'avenir') rows.appendChild(row('Temps restant', s.daysLeft === 1 ? 'dernier jour' : `${fmtDays(s.daysLeft)} (jusqu\u2019au ${fmtLong(goal.end, false)})`));
    const pace = (s.state === 'ok' || s.state === 'avance' || s.state === 'retard') ? fmtPace(s.remainingBooks, s.daysLeft) : '';
    if (pace) rows.appendChild(row('Allure conseillée', pace));

    /* Les livres comptés, datés — la preuve que le compte est honnête. */
    const det = document.createElement('details');
    det.className = 'goal-det';
    const sum = document.createElement('summary');
    sum.textContent = s.finished.length
      ? `Livres comptés (${s.finished.length}) — voir la liste`
      : 'Livres comptés (0)';
    det.appendChild(sum);
    if (s.finished.length) {
      const ul = document.createElement('ul');
      ul.className = 'goal-list';
      for (const f of s.finished.slice().reverse()) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="gl-t"></span><span class="gl-d">${NC.fmtDate(f.at)}</span>`;
        li.querySelector('.gl-t').textContent = f.title || 'Livre sans titre';
        ul.appendChild(li);
      }
      det.appendChild(ul);
    } else {
      const p = document.createElement('p');
      p.className = 'goal-det-none';
      p.textContent = 'Aucun livre compté pour l\u2019instant — les prochains « Terminé » de la période le seront.';
      det.appendChild(p);
    }

    const actions = document.createElement('div');
    actions.className = 'modal-actions spread';
    const rm = document.createElement('button');
    rm.className = 'mini-btn danger' + (confirmRemove ? ' confirm' : '');
    rm.type = 'button';
    rm.textContent = confirmRemove ? 'Confirmer le retrait' : 'Retirer l\u2019objectif';
    rm.addEventListener('click', () => {
      if (!confirmRemove) { confirmRemove = true; renderModal(); return; }
      goal = null;
      try { localStorage.removeItem(LS_KEY); } catch (e) { /* tant pis */ }
      close();
      NC.toast('Objectif retiré — la bibliothèque n\u2019en parle plus.', 'info');
      renderBanner();
    });
    const edit = document.createElement('button');
    edit.className = 'btn';
    edit.type = 'button';
    edit.textContent = 'Modifier';
    edit.addEventListener('click', () => { mode = 'form'; confirmRemove = false; renderModal(); });
    actions.append(rm, edit);

    const hint = document.createElement('p');
    hint.className = 'goal-hint';
    hint.textContent = 'Comptent les livres passés « Terminé » pendant la période — à la main, ou tout seul en atteignant la fin.';

    frag.append(big, bar, line, rows, det, actions, hint);
    return frag;
  }

  function formView() {
    const tKey = todayKey();
    const frag = document.createDocumentFragment();
    const h = document.createElement('h4');
    h.id = 'goal-pop-title';
    h.textContent = goal ? 'Modifier l\u2019objectif' : 'Se fixer un objectif';
    frag.appendChild(h);

    const labN = document.createElement('label');
    labN.className = 'goal-lab';
    labN.textContent = 'Nombre de livres à finir';
    const num = document.createElement('input');
    num.type = 'number';
    num.min = '1'; num.max = '999'; num.step = '1';
    num.value = goal ? goal.target : 12;
    num.id = 'goal-num';

    const labP = document.createElement('label');
    labP.className = 'goal-lab';
    labP.textContent = 'Échéance';
    const sel = document.createElement('select');
    sel.id = 'goal-period';
    for (const p of PERIODS) {
      const o = document.createElement('option');
      o.value = p.key; o.textContent = p.label;
      sel.appendChild(o);
    }
    /* Un objectif existant ne se replie pas toujours sur un preset :
       la date libre garde la vérité. */
    let curPeriod = 's1';
    if (goal) {
      const match = PERIODS.find((p) => {
        if (p.key === 'date') return false;
        const r = periodRange(p.key, tKey);
        return r.start === goal.start && r.end === goal.end;
      });
      curPeriod = match ? match.key : 'date';
    } else {
      curPeriod = 'm1';
    }
    sel.value = curPeriod;

    const date = document.createElement('input');
    date.type = 'date';
    date.id = 'goal-date';
    date.min = tKey;
    date.value = goal ? goal.end : '';
    date.hidden = curPeriod !== 'date';

    /* La période choisie, recalculée sous les yeux : « du 3 novembre au
       2 décembre — 30 jours » ; et un rappel de ce que compte le preset. */
    const see = document.createElement('p');
    see.className = 'goal-see';
    const seeUpdate = () => {
      const r = sel.value === 'date'
        ? periodRange('date', tKey, date.value)
        : periodRange(sel.value, tKey);
      const n = dayDiff(r.end, r.start) + 1;
      const base = sel.value === 'annee'
        ? 'les livres déjà finis cette année comptent'
        : sel.value === 'mois'
          ? 'les livres déjà finis ce mois comptent'
          : 'le compte part d\u2019aujourd\u2019hui';
      see.innerHTML = `${fmtPeriod(r.start, r.end)} — ${pl(n, 'jour')} · ${base}`;
    };
    seeUpdate();
    sel.addEventListener('change', () => { date.hidden = sel.value !== 'date'; if (!date.hidden && !date.value) date.value = tKey; seeUpdate(); });
    date.addEventListener('change', () => {
      if (date.value && date.value < tKey) date.value = tKey; // pas de passé
      seeUpdate();
    });

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.className = 'mini-btn';
    cancel.type = 'button';
    cancel.textContent = 'Annuler';
    cancel.addEventListener('click', () => { mode = goal ? 'view' : 'form'; close(); });
    const ok = document.createElement('button');
    ok.className = 'btn btn-gold';
    ok.type = 'button';
    ok.textContent = goal ? 'Enregistrer' : 'Se lancer';
    ok.addEventListener('click', () => {
      const n = Math.max(1, Math.min(999, Math.floor(Number(num.value) || 0)));
      const range = periodRange(sel.value, tKey, date.value);
      const was = goal;
      goal = {
        target: n, start: range.start, end: range.end,
        createdAt: was ? was.createdAt : Date.now(),
        /* Un nouveau cap (cible ou échéance changées) repart sans crédit
           de célébration — même si l'ancien était atteint. */
        celebrated: !!(was && was.target === n && was.end === range.end && was.start === range.start && was.celebrated),
      };
      save();
      close();
      renderBanner();
      maybeCelebrate();
    });
    actions.append(cancel, ok);

    const hint = document.createElement('p');
    hint.className = 'goal-hint';
    hint.textContent = 'Rien ne quitte cet ordinateur — l\u2019objectif vit dans ce navigateur, avec le reste.';

    frag.append(labN, num, labP, sel, date, see, actions, hint);
    return frag;
  }

  /* ── Ouverture / fermeture (le fond flouté est celui des groupes) ── */
  function open(atMode) {
    load();
    mode = atMode || (goal ? 'view' : 'form');
    confirmRemove = false;
    const pop = NC.$('#goal-pop');
    const back = NC.$('#modal-backdrop');
    if (!pop) return;
    pop.hidden = false;
    if (back) back.hidden = false;
    renderModal();
    const focusable = pop.querySelector('input, select, button');
    if (focusable) { try { focusable.focus({ preventScroll: true }); } catch (e) { /* vieux navigateur */ } }
  }
  function close() {
    const pop = NC.$('#goal-pop');
    if (pop) pop.hidden = true;
    const back = NC.$('#modal-backdrop');
    if (back) back.hidden = true;
    mode = goal ? 'view' : 'form';
    confirmRemove = false;
  }
  const isOpen = () => { const pop = NC.$('#goal-pop'); return !!pop && !pop.hidden; };

  /* ── Célébration : une fois par objectif, pas une par livre. ── */
  function maybeCelebrate() {
    if (!goal) return;
    const s = snapshot();
    if (!s) return;
    if (s.state === 'atteint' && !s.expired && !goal.celebrated) {
      goal.celebrated = true;
      save();
      NC.toast(`Objectif atteint — ${pl(goal.target, 'livre')} terminé${goal.target > 1 ? 's' : ''}. Belle lune.`, 'success', 6000);
    }
  }

  /* ── Rendu complet, appelé par la bibliothèque à chaque changement ── */
  function refresh() {
    load();
    renderBanner();
    if (isOpen()) renderModal();
    maybeCelebrate();
  }

  /* ── Câblage : la bannière est un bouton (clic, Entrée, Espace). ── */
  function init() {
    const el = NC.$('#goal-banner');
    if (!el) return;
    el.addEventListener('click', () => open());
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      open();
    });
  }

  return { init, refresh, open, close, isOpen, _snapshot: snapshot };
})();
