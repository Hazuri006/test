/** Tiny DOM helper to build elements declaratively. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: {
    class?: string;
    text?: string;
    html?: string;
    style?: Partial<CSSStyleDeclaration>;
    attrs?: Record<string, string>;
    on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
  } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.html !== undefined) node.innerHTML = opts.html;
  if (opts.style) Object.assign(node.style, opts.style);
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  if (opts.on)
    for (const [evt, fn] of Object.entries(opts.on)) {
      node.addEventListener(evt, fn as EventListener);
    }
  for (const c of children) node.append(c);
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
