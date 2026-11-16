/* Profils de lecture. Le catalogue, ses instantanés et les préférences
   individuelles suivent les magasins settings/prefs du ZIP v1. */
'use strict';

NC.profiles = (() => {
  const key = 'readingProfiles';
  const widths = { original: 'Standard', narrow: 'Étroite', medium: 'Moyenne', wide: 'Large' };
  const margins = { original: 'Standard', compact: 'Réduites', generous: 'Généreuses' };
  const paragraphs = { original: 'Standard', compact: 'Rapprochés', generous: 'Aérés' };
  const has = (values, key) => Object.hasOwn(values, key);
  const option = (values, value) => has(values, value) ? value : 'original';

  function normalize(source = {}) {
    const typo = NC.normalizeTypo(source.typo);
    return {
      typo: { ...typo, width: option(widths, source.typo?.width),
        margin: option(margins, source.typo?.margin), paragraph: option(paragraphs, source.typo?.paragraph) },
      fontSize: Math.max(80, Math.min(170, Math.round(Number(source.fontSize) || 100))),
      theme: has(NC.BOOK_THEMES, source.theme) ? source.theme : 'paper',
      flow: source.flow === 'scrolled' ? 'scrolled' : 'paginated',
    };
  }

  function overlay(base, patch) {
    return { ...base, ...patch, typo: { ...base?.typo, ...patch?.typo } };
  }

  const presets = [
    ['roman', 'Roman', { typo: { width: 'medium' } }],
    ['philosophie', 'Philosophie', { fontSize: 110, typo: { width: 'medium', font: 'serif', lineHeight: 1.85, paragraph: 'generous' } }],
    ['poesie', 'Poésie', { typo: { margin: 'generous', lineHeight: 1.85 }, flow: 'scrolled' }],
    ['lecture-nocturne', 'Lecture nocturne', { theme: 'night', fontSize: 110, typo: { width: 'medium', lineHeight: 1.85 } }],
  ].map(([id, name, settings]) => ({ id, name, settings: normalize(settings), revision: 'preset', preset: true }));

  function read(value) {
    const rows = Array.isArray(value?.profiles) ? value.profiles : [];
    const records = new Map(presets.map((row) => [row.id, row]));
    for (const row of rows) {
      if (typeof row?.id !== 'string' || typeof row.name !== 'string' || !row.settings) continue;
      records.set(row.id, { ...row, settings: normalize(row.settings), preset: presets.some(({ id }) => id === row.id) });
    }
    return { profiles: [...records.values()], defaultId: records.has(value?.defaultId) ? value.defaultId : null };
  }

  function merge(local, backup) {
    // Les entrées locales explicites priment. Les modèles virtuels ne bloquent pas une version importée.
    const imported = read(backup).profiles.filter((row) => row.revision !== 'preset');
    const kept = read(local).profiles.filter((row) => row.revision !== 'preset');
    const profiles = new Map([...imported, ...kept].map((row) => [row.id, row]));
    return { profiles: [...profiles.values()], defaultId: read(local).defaultId };
  }

  const catalog = () => NC.db.getSetting(key, null).then(read);
  const mutate = (change) => NC.db.updateProfiles((raw) => {
    const state = read(raw);
    change(state);
    state.profiles = state.profiles.filter((row) => row.revision !== 'preset');
    return state;
  }).then(read);

  function requireCurrent(state, expected) {
    const row = state.profiles.find(({ id }) => id === expected.id);
    if (!row || row.revision !== expected.revision) {
      throw new DOMException('Ce profil a changé dans un autre onglet. Sélectionnez-le à nouveau.', 'InvalidStateError');
    }
    return row;
  }

  function save(name, settings, expected) {
    name = String(name).trim();
    if (!name || name.length > 64) throw new DOMException('Saisissez un nom de 1 à 64 caractères.', 'DataError');
    const record = { id: expected?.id || crypto.randomUUID(), name, settings: normalize(settings), revision: crypto.randomUUID() };
    return mutate((state) => {
      if (expected) requireCurrent(state, expected);
      if (state.profiles.some((row) => row.id !== record.id && row.name.localeCompare(name, 'fr', { sensitivity: 'accent' }) === 0)) {
        throw new DOMException('Ce nom est déjà utilisé. Choisissez un autre nom.', 'DataError');
      }
      state.profiles = state.profiles.filter(({ id }) => id !== record.id).concat(record);
    }).then((state) => state.profiles.find(({ id }) => id === record.id));
  }

  const remove = (expected) => mutate((state) => {
    if (requireCurrent(state, expected).preset) throw new Error('Ce modèle peut être personnalisé ou dupliqué.');
    state.profiles = state.profiles.filter(({ id }) => id !== expected.id);
    if (state.defaultId === expected.id) state.defaultId = null;
  });

  const setDefault = (expected) => mutate((state) => {
    state.defaultId = expected ? requireCurrent(state, expected).id : null;
  });

  const bind = (profile, previous = null) => ({
    binding: crypto.randomUUID(), profile, overrides: {}, previous,
  });
  const forImport = (raw) => {
    const state = read(raw);
    const profile = state.profiles.find(({ id }) => id === state.defaultId);
    return profile ? bind(profile) : null;
  };

  const effective = (reading, legacy) => normalize(reading
    ? overlay(reading.profile?.settings || legacy, reading.overrides) : legacy);

  function describe(settings, restricted) {
    const { theme, typo, fontSize, flow } = normalize(settings);
    const color = NC.BOOK_THEMES[theme].label;
    if (restricted) return `Thème ${color} · seul le thème s’applique à ce format.`;
    return [NC.BOOK_FONTS[typo.font].label, `${fontSize} %`, `interligne ${typo.lineHeight.toLocaleString('fr')}`,
      typo.justify === 'justify' ? 'justifié' : 'aligné au début', color, `largeur ${widths[typo.width].toLowerCase()}`,
      `marges ${margins[typo.margin].toLowerCase()}`, `paragraphes ${paragraphs[typo.paragraph].toLowerCase()}`,
      flow === 'scrolled' ? 'défilement' : 'pages'].join(' · ');
  }

  return { key, widths, margins, paragraphs, catalog, merge, save, remove, setDefault, bind, forImport, effective, overlay, normalize, describe };
})();

/* Les actions de gestion restent repliées sous le sélecteur rapide. */
NC.profilePanel = (container, options) => {
  const root = document.createElement('section');
  root.className = 'reading-profiles';
  root.innerHTML = `
    <h4>Profils de lecture</h4>
    <p class="profile-current" role="status"></p>
    <div class="profile-row">
      <label class="profile-choice">Choisir un profil <select data-profile-choice aria-describedby="profile-details"></select></label>
      <button type="button" class="typo-opt" data-profile="apply">Appliquer</button>
    </div>
    <p class="profile-help" id="profile-details"></p>
    <label class="profile-session"><input type="checkbox" data-profile-session> Ajuster pour cette session uniquement</label>
    <div class="profile-row profile-undo">
      <button type="button" class="typo-opt" data-profile="reset" hidden>Rétablir le profil</button>
      <button type="button" class="typo-opt" data-profile="undo" hidden>Réglages précédents</button>
    </div>
    <details>
      <summary>Gérer les profils</summary>
      <p class="profile-help" data-profile-default></p>
      <label>Nom du profil <input type="text" maxlength="64" autocomplete="off" data-profile-name></label>
      <div class="profile-actions">
        <button type="button" class="typo-opt" data-profile="save">Créer avec les réglages actuels</button>
        <button type="button" class="typo-opt" data-profile="rename">Renommer</button>
        <button type="button" class="typo-opt" data-profile="update">Enregistrer les réglages dans ce profil</button>
        <button type="button" class="typo-opt" data-profile="copy">Dupliquer</button>
        <button type="button" class="typo-opt" data-profile="default">Définir par défaut</button>
        <button type="button" class="typo-opt" data-profile="delete">Supprimer</button>
      </div>
      <div class="profile-confirm" hidden>
        <p class="profile-help" id="profile-confirm-message"></p>
        <button type="button" class="typo-opt" data-profile="confirm" aria-describedby="profile-confirm-message">Confirmer la suppression</button>
        <button type="button" class="typo-opt" data-profile="cancel">Annuler</button>
      </div>
    </details>
    <p class="profile-message" role="status"></p>`;
  container.append(root);
  const select = root.querySelector('select');
  const input = root.querySelector('[data-profile-name]');
  const session = root.querySelector('[data-profile-session]');
  const feedback = root.querySelector('.profile-message');
  const buttons = Object.fromEntries([...root.querySelectorAll('[data-profile]')].map((button) => [button.dataset.profile, button]));
  const confirmation = root.querySelector('.profile-confirm');
  let confirming = null;
  let draftProfile;
  let catalog;
  let pending = false;
  let revision = 0;
  const selected = () => catalog?.profiles.find(({ id }) => id === select.value);
  if (options.restricted) buttons.update.textContent = 'Enregistrer le thème dans ce profil';

  function sync() {
    const reading = options.state();
    const applied = reading?.profile;
    const edits = Object.entries(reading?.overrides || {}).some(([key, value]) =>
      key !== 'typo' || Object.keys(value || {}).length);
    const saved = catalog?.profiles.find(({ id }) => id === applied?.id);
    const label = root.querySelector('.profile-current');
    const extra = options.session() ? ' · session uniquement' : '';
    const status = (!applied ? 'Réglages du livre' : `Profil appliqué · ${applied.name}${edits ? ' · ajustements pour ce livre' : ''}`) + extra;
    const version = applied && catalog && saved?.revision !== applied.revision ? ' · version conservée' : '';
    if (label.textContent !== status + version) label.textContent = status + version;
    const profile = selected();
    root.querySelector('#profile-details').textContent = profile ? NC.profiles.describe(profile.settings, options.restricted) : '';
    const defaultProfile = catalog?.profiles.find(({ id }) => id === catalog.defaultId);
    root.querySelector('[data-profile-default]').textContent = defaultProfile
      ? `Pour les nouveaux imports · ${defaultProfile.name}` : 'Les nouveaux imports utilisent les réglages habituels.';
    buttons.default.textContent = profile && profile.id === catalog.defaultId ? 'Retirer le profil par défaut' : 'Définir par défaut';
    session.checked = !!options.session();
    buttons.reset.hidden = !applied || (!edits && !options.session());
    buttons.undo.hidden = !reading?.previous && !applied;
    buttons.undo.textContent = reading?.previous ? 'Réglages précédents' : 'Retirer le profil du livre';
    for (const action of ['apply', 'rename', 'update', 'copy', 'default']) buttons[action].disabled = !profile || pending;
    buttons.delete.disabled = !profile || profile.preset || pending;
    buttons.confirm.disabled = pending;
    buttons.save.disabled = !catalog || pending;
    buttons.undo.disabled = pending;
    buttons.reset.disabled = pending;
  }

  async function refresh(preferred, updateName = false) {
    const request = ++revision;
    try {
      const value = await NC.profiles.catalog();
      if (request !== revision || !root.isConnected) return;
      const id = preferred || select.value || options.state()?.profile?.id;
      catalog = value;
      select.replaceChildren(...catalog.profiles.map((row) => new Option(row.name, row.id)));
      if (catalog.profiles.some((row) => row.id === id)) select.value = id;
      if (updateName) {
        draftProfile = selected();
        input.value = draftProfile?.name || '';
      }
      sync();
    } catch (error) {
      feedback.textContent = 'Impossible de charger les profils de lecture.';
    }
  }

  function closeConfirmation(focus) {
    confirmation.hidden = true;
    confirming = null;
    if (focus) NC.focus(buttons.delete, select);
  }

  select.addEventListener('change', () => {
    closeConfirmation(false);
    draftProfile = selected();
    input.value = draftProfile?.name || '';
    sync();
  });
  session.addEventListener('change', () => options.toggleSession(session.checked));

  root.addEventListener('click', async (event) => {
    const action = event.target.closest('button')?.dataset.profile;
    if (!action || pending) return;
    const profile = selected();
    if (action === 'delete') {
      confirming = profile;
      confirmation.querySelector('p').textContent = `Supprimer « ${profile.name} » ? Les livres qui l’utilisent gardent leurs réglages.`;
      confirmation.hidden = false;
      NC.focus(buttons.cancel);
      return;
    }
    if (action === 'cancel') { closeConfirmation(true); return; }
    pending = true;
    feedback.textContent = '';
    sync();
    let focusAfter;
    try {
      if (action === 'apply') await options.apply(profile);
      if (action === 'reset' || action === 'undo') {
        await options.undo(action === 'reset');
        focusAfter = select;
      }
      if (action === 'default') await NC.profiles.setDefault(profile.id === catalog.defaultId ? null : profile);
      if (action === 'confirm') {
        await NC.profiles.remove(confirming);
        closeConfirmation(false);
        focusAfter = select;
        feedback.textContent = 'Profil supprimé.';
      }
      if (['save', 'copy', 'rename', 'update'].includes(action)) {
        const copy = action === 'copy';
        const name = action === 'update' ? profile.name
          : copy && (!input.value.trim() || input.value.trim() === profile.name) ? `${profile.name.slice(0, 56)} (copie)` : input.value;
        let settings = copy || action === 'rename' ? profile.settings : options.current();
        if (options.restricted && action === 'update') settings = { ...profile.settings, theme: settings.theme };
        const existing = action === 'rename' || action === 'update' ? (draftProfile?.id === profile.id ? draftProfile : profile) : undefined;
        const result = await NC.profiles.save(name, settings, existing);
        await refresh(result.id, true);
        feedback.textContent = 'Profil enregistré.';
      }
      if (action === 'confirm' || action === 'default') await refresh(null, true);
    } catch (error) {
      feedback.textContent = error.name === 'InvalidStateError' || error.name === 'DataError'
        ? error.message : 'Impossible d’enregistrer la modification du profil.';
      if (error.name === 'InvalidStateError') {
        closeConfirmation(false);
        await refresh(null, true);
        focusAfter = select;
      }
      if (error.name === 'DataError') focusAfter = input;
    } finally {
      pending = false;
      sync();
      if (!focusAfter && document.activeElement === document.body) focusAfter = buttons[action].hidden ? select : buttons[action];
      if (focusAfter && root.isConnected) NC.focus(focusAfter, select);
    }
  });

  sync();
  refresh(null, true);
  return { sync, refresh };
};
