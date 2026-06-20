/** Tiny DOM helpers — keeps component code declarative without a framework. */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(props)) {
    if (val == null || val === false) continue;
    if (key === 'class') node.className = val;
    else if (key === 'html') node.innerHTML = val;
    else if (key === 'text') node.textContent = val;
    else if (key.startsWith('on') && typeof val === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'dataset') {
      Object.assign(node.dataset, val);
    } else {
      node.setAttribute(key, val);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** SVG-namespaced element creator (for the precision curve). */
export function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    node.setAttribute(k, String(v));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}
