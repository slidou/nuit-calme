/* Repères transitoires de recomposition. Les CFI enregistrés dans les
   annotations et les signets restent gérés par epub.js. */
'use strict';

NC.epubAnchor = (() => {
  function textRect(range) {
    const node = range?.startContainer;
    if (node?.nodeType !== Node.TEXT_NODE || !node.length) return null;
    const char = range.cloneRange();
    const offset = Math.min(range.startOffset, node.length - 1);
    char.setStart(node, offset);
    char.setEnd(node, offset + 1);
    return char.getBoundingClientRect();
  }

  function clip(view, host) {
    const frame = view.iframe.getBoundingClientRect();
    const stage = host.getBoundingClientRect();
    return { left: Math.max(0, stage.left - frame.left), top: Math.max(0, stage.top - frame.top),
      right: Math.min(frame.width, stage.right - frame.left), bottom: Math.min(frame.height, stage.bottom - frame.top) };
  }

  function visible(range, bounds) {
    const rect = textRect(range);
    return rect && rect.width > 0 && rect.height > 0 && rect.right > bounds.left && rect.left < bounds.right &&
      rect.top + rect.height / 2 >= bounds.top - 1 && rect.bottom - rect.height / 2 < bounds.bottom;
  }

  function textAnchor(view, range, cfi) {
    const node = range.startContainer;
    const offset = range.startOffset;
    const start = Math.max(0, offset - 22);
    const excerpt = node.nodeType === Node.TEXT_NODE ? node.data.slice(start, offset + 42) : '';
    return { cfi: cfi || view.contents.cfiFromRange(range), index: view.section.index,
      href: view.section.href, excerpt: excerpt.trim().length >= 16 ? excerpt : '', offset: offset - start };
  }

  function capture(rendition, host, location) {
    const start = location?.start;
    if (!start?.cfi) return null;
    const views = rendition.views().displayed();
    const view = views.find(({ section }) => section.index === start.index);
    if (view?.contents && view.iframe) {
      try {
        const bounds = clip(view, host);
        const mapped = view.contents.range(start.cfi);
        if (visible(mapped, bounds)) return textAnchor(view, mapped, start.cfi);
        const doc = view.contents.document;
        const rtl = rendition.settings.defaultDirection === 'rtl' || doc.dir === 'rtl';
        const width = bounds.right - bounds.left;
        for (let y = bounds.top + 5; y < Math.min(bounds.bottom, bounds.top + 130); y += 8) {
          for (const fraction of [.12, .22, .35, .48]) {
            const x = rtl ? bounds.right - width * fraction : bounds.left + width * fraction;
            const range = doc.caretRangeFromPoint?.(x, y);
            if (visible(range, bounds)) return textAnchor(view, range);
          }
        }
        if (mapped) return textAnchor(view, mapped, start.cfi);
      } catch (error) { /* le CFI du moteur reste disponible */ }
    }
    return { cfi: start.cfi, index: start.index, href: start.href };
  }

  function recover(rendition, anchor) {
    const view = rendition.views().displayed().find(({ section }) => section.index === anchor.index);
    if (!view?.contents || !anchor.excerpt) return null;
    const contents = view.contents;
    try {
      const range = contents.range(anchor.cfi);
      const node = range?.startContainer;
      const start = (range?.startOffset ?? 0) - anchor.offset;
      if (node?.nodeType === Node.TEXT_NODE && start >= 0 && node.data.slice(start, start + anchor.excerpt.length) === anchor.excerpt) {
        return anchor.cfi;
      }
    } catch (error) { /* recherche de l'extrait dans la même section */ }
    const doc = contents.document;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let found;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const index = node.data.indexOf(anchor.excerpt);
      if (index < 0) continue;
      if (found || node.data.indexOf(anchor.excerpt, index + 1) !== -1) return null;
      found = { node, offset: index + anchor.offset };
    }
    if (!found) return null;
    const range = doc.createRange();
    range.setStart(found.node, found.offset);
    range.collapse(true);
    return contents.cfiFromRange(range);
  }

  function inView(rendition, host, anchor) {
    try {
      const view = rendition.views().displayed().find(({ section }) => section.index === anchor.index);
      return !!view?.iframe && visible(view.contents.range(anchor.cfi), clip(view, host));
    } catch (error) { return false; }
  }

  return { capture, recover, inView };
})();
