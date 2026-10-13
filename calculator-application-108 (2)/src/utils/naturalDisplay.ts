// Natural Display Expression Tree and Helpers

export type BoxNode = 
  | { type: 'char'; id: string; char: string }
  | { type: 'fraction'; id: string; num: BoxNode[]; den: BoxNode[] }
  | { type: 'power'; id: string; base: BoxNode[]; exp: BoxNode[] }
  | { type: 'sqrt'; id: string; content: BoxNode[] }
  | { type: 'nroot'; id: string; degree: BoxNode[]; content: BoxNode[] }
  | { type: 'function'; id: string; name: string; arg: BoxNode[] }
  | { type: 'abs'; id: string; content: BoxNode[] }
  | { type: 'parens'; id: string; content: BoxNode[] }
  | { type: 'subscript'; id: string; base: BoxNode[]; sub: BoxNode[] }
  | { type: 'integral'; id: string; lower: BoxNode[]; upper: BoxNode[]; integrand: BoxNode[]; varName: string }
  | { type: 'summation'; id: string; lower: BoxNode[]; upper: BoxNode[]; term: BoxNode[] };

export interface ActiveTarget {
  nodeId: string;
  slot: 'root' | 'num' | 'den' | 'base' | 'exp' | 'content' | 'degree' | 'arg' | 'sub' | 'lower' | 'upper' | 'integrand' | 'term';
  index: number;
}

export function generateId(): string {
  return 'b_' + Math.random().toString(36).substring(2, 9);
}

// Convert BoxNode array to mathematical LaTeX string
export function nodesToLatex(nodes: BoxNode[], activeTarget?: ActiveTarget, currentSlot: string = 'root', parentId: string = 'root'): string {
  if (!nodes || nodes.length === 0) {
    if (activeTarget && activeTarget.nodeId === parentId && activeTarget.slot === currentSlot) {
      return `\\color{#10b981}{\\boxed{\\phantom{0}}}`;
    }
    return `{\\color{#64748b}\\boxed{\\phantom{0}}}`;
  }

  let out = '';
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isCursorHere = activeTarget && activeTarget.nodeId === parentId && activeTarget.slot === currentSlot && activeTarget.index === i;
    if (isCursorHere) {
      out += `\\color{#10b981}{|}\\color{inherit}`;
    }

    switch (node.type) {
      case 'char': {
        if (node.char === '*') out += ' \\times ';
        else if (node.char === '/') out += ' \\div ';
        else if (node.char === 'pi' || node.char === 'π') out += ' \\pi ';
        else if (node.char === 'theta' || node.char === 'θ') out += ' \\theta ';
        else if (node.char === 'infinity' || node.char === '∞') out += ' \\infty ';
        else out += node.char;
        break;
      }
      case 'fraction': {
        const numLatex = nodesToLatex(node.num, activeTarget, 'num', node.id);
        const denLatex = nodesToLatex(node.den, activeTarget, 'den', node.id);
        out += `\\frac{${numLatex}}{${denLatex}}`;
        break;
      }
      case 'power': {
        const baseLatex = nodesToLatex(node.base, activeTarget, 'base', node.id);
        const expLatex = nodesToLatex(node.exp, activeTarget, 'exp', node.id);
        out += `{${baseLatex}}^{${expLatex}}`;
        break;
      }
      case 'sqrt': {
        const contentLatex = nodesToLatex(node.content, activeTarget, 'content', node.id);
        out += `\\sqrt{${contentLatex}}`;
        break;
      }
      case 'nroot': {
        const degLatex = nodesToLatex(node.degree, activeTarget, 'degree', node.id);
        const contentLatex = nodesToLatex(node.content, activeTarget, 'content', node.id);
        out += `\\sqrt[${degLatex}]{${contentLatex}}`;
        break;
      }
      case 'function': {
        const argLatex = nodesToLatex(node.arg, activeTarget, 'arg', node.id);
        out += `\\${node.name}\\left(${argLatex}\\right)`;
        break;
      }
      case 'abs': {
        const contentLatex = nodesToLatex(node.content, activeTarget, 'content', node.id);
        out += `\\left|{${contentLatex}}\\right|`;
        break;
      }
      case 'parens': {
        const contentLatex = nodesToLatex(node.content, activeTarget, 'content', node.id);
        out += `\\left(${contentLatex}\\right)`;
        break;
      }
      case 'subscript': {
        const baseLatex = nodesToLatex(node.base, activeTarget, 'base', node.id);
        const subLatex = nodesToLatex(node.sub, activeTarget, 'sub', node.id);
        out += `{${baseLatex}}_{${subLatex}}`;
        break;
      }
      case 'integral': {
        const lowerLatex = nodesToLatex(node.lower, activeTarget, 'lower', node.id);
        const upperLatex = nodesToLatex(node.upper, activeTarget, 'upper', node.id);
        const integrandLatex = nodesToLatex(node.integrand, activeTarget, 'integrand', node.id);
        out += `\\int_{${lowerLatex}}^{${upperLatex}} ${integrandLatex} \\, d${node.varName}`;
        break;
      }
      case 'summation': {
        const lowerLatex = nodesToLatex(node.lower, activeTarget, 'lower', node.id);
        const upperLatex = nodesToLatex(node.upper, activeTarget, 'upper', node.id);
        const termLatex = nodesToLatex(node.term, activeTarget, 'term', node.id);
        out += `\\sum_{${lowerLatex}}^{${upperLatex}} ${termLatex}`;
        break;
      }
    }
  }

  const isCursorAtEnd = activeTarget && activeTarget.nodeId === parentId && activeTarget.slot === currentSlot && activeTarget.index === nodes.length;
  if (isCursorAtEnd) {
    out += `\\color{#10b981}{|}\\color{inherit}`;
  }

  return out;
}

// Clean, purely mathematical LaTeX (no cursor, no engine syntax) used in the solution steps
const FN_TEX: Record<string, string> = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan',
  asin: '\\sin^{-1}', acos: '\\cos^{-1}', atan: '\\tan^{-1}',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
  asinh: '\\sinh^{-1}', acosh: '\\cosh^{-1}', atanh: '\\tanh^{-1}',
  ln: '\\ln', log: '\\log', exp: '\\exp'
};
const DIRECT_TRIG = ['sin', 'cos', 'tan'];

export function isPlainNumber(nodes: BoxNode[]): boolean {
  return nodes.length > 0 && nodes.every((n) => n.type === 'char' && /[0-9.\-]/.test(n.char));
}

export function nodesToCleanLatex(nodes: BoxNode[], angleMode: 'DEG' | 'RAD' | 'GRAD' = 'DEG'): string {
  if (!nodes || nodes.length === 0) return '\\square';
  const grp = (l: BoxNode[]) => nodesToCleanLatex(l, angleMode);
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'char': {
        const c = node.char;
        if (c === '×' || c === '*') out += ' \\times ';
        else if (c === '÷' || c === '/') out += ' \\div ';
        else if (c === '+') out += ' + ';
        else if (c === '-') out += ' - ';
        else if (c === 'π') out += '\\pi ';
        else if (c === '%') out += '\\%';
        else out += c;
        break;
      }
      case 'fraction':
        out += `\\dfrac{${grp(node.num)}}{${grp(node.den)}}`;
        break;
      case 'power': {
        const simpleBase = node.base.length === 1 || isPlainNumber(node.base);
        const b = grp(node.base);
        out += simpleBase ? `{${b}}^{${grp(node.exp)}}` : `\\left(${b}\\right)^{${grp(node.exp)}}`;
        break;
      }
      case 'sqrt':
        out += `\\sqrt{${grp(node.content)}}`;
        break;
      case 'nroot':
        out += `\\sqrt[${grp(node.degree)}]{${grp(node.content)}}`;
        break;
      case 'function': {
        let arg = grp(node.arg);
        if (DIRECT_TRIG.includes(node.name) && isPlainNumber(node.arg)) {
          if (angleMode === 'DEG') arg += '^{\\circ}';
          else if (angleMode === 'GRAD') arg += '^{\\mathrm{g}}';
        }
        out += `${FN_TEX[node.name] || `\\operatorname{${node.name}}`}\\left(${arg}\\right)`;
        break;
      }
      case 'abs':
        out += `\\left|${grp(node.content)}\\right|`;
        break;
      case 'parens':
        out += `\\left(${grp(node.content)}\\right)`;
        break;
      case 'subscript':
        out += `{${grp(node.base)}}_{${grp(node.sub)}}`;
        break;
      default:
        break;
    }
  }
  return out.trim();
}

// All direct trigonometric function nodes found in the tree (for the angle conversion step)
export function collectTrigNodes(nodes: BoxNode[]): Extract<BoxNode, { type: 'function' }>[] {
  const found: Extract<BoxNode, { type: 'function' }>[] = [];
  const walk = (list: BoxNode[]) => {
    for (const n of list) {
      if (n.type === 'function') {
        if (DIRECT_TRIG.includes(n.name)) found.push(n);
        walk(n.arg);
      } else if (n.type === 'fraction') { walk(n.num); walk(n.den); }
      else if (n.type === 'power') { walk(n.base); walk(n.exp); }
      else if (n.type === 'nroot') { walk(n.degree); walk(n.content); }
      else if (n.type === 'sqrt' || n.type === 'abs' || n.type === 'parens') walk(n.content);
      else if (n.type === 'subscript') { walk(n.base); walk(n.sub); }
    }
  };
  walk(nodes);
  return found;
}

// Convert BoxNode array to executable mathjs string
export function nodesToMathjs(nodes: BoxNode[], angleMode: 'DEG' | 'RAD' | 'GRAD' = 'DEG'): string {
  if (!nodes || nodes.length === 0) return '0';

  let out = '';
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    switch (node.type) {
      case 'char': {
        if (node.char === '×') out += ' * ';
        else if (node.char === '÷') out += ' / ';
        else if (node.char === 'π') out += ' pi ';
        else if (node.char === 'e') out += ' e ';
        else if (node.char === 'i') out += ' i ';
        else out += node.char;
        break;
      }
      case 'fraction': {
        const num = nodesToMathjs(node.num, angleMode);
        const den = nodesToMathjs(node.den, angleMode);
        out += ` ((${num}) / (${den})) `;
        break;
      }
      case 'power': {
        const base = nodesToMathjs(node.base, angleMode);
        const exp = nodesToMathjs(node.exp, angleMode);
        out += ` ((${base}) ^ (${exp})) `;
        break;
      }
      case 'sqrt': {
        const content = nodesToMathjs(node.content, angleMode);
        out += ` sqrt(${content}) `;
        break;
      }
      case 'nroot': {
        const deg = nodesToMathjs(node.degree, angleMode);
        const content = nodesToMathjs(node.content, angleMode);
        out += ` ((${content}) ^ (1 / (${deg}))) `;
        break;
      }
      case 'function': {
        const arg = nodesToMathjs(node.arg, angleMode);
        const fn = node.name;
        // Handle trig with angle modes
        if (['sin', 'cos', 'tan', 'sec', 'csc', 'cot'].includes(fn)) {
          if (angleMode === 'DEG') {
            out += ` ${fn}((${arg}) * pi / 180) `;
          } else if (angleMode === 'GRAD') {
            out += ` ${fn}((${arg}) * pi / 200) `;
          } else {
            out += ` ${fn}(${arg}) `;
          }
        } else if (['asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan'].includes(fn)) {
          const baseFn = fn.startsWith('arc') ? 'a' + fn.slice(3) : fn;
          if (angleMode === 'DEG') {
            out += ` (${baseFn}(${arg}) * 180 / pi) `;
          } else if (angleMode === 'GRAD') {
            out += ` (${baseFn}(${arg}) * 200 / pi) `;
          } else {
            out += ` ${baseFn}(${arg}) `;
          }
        } else if (fn === 'ln') {
          out += ` log(${arg}) `;
        } else if (fn === 'log') {
          out += ` log10(${arg}) `;
        } else {
          out += ` ${fn}(${arg}) `;
        }
        break;
      }
      case 'abs': {
        const content = nodesToMathjs(node.content, angleMode);
        out += ` abs(${content}) `;
        break;
      }
      case 'parens': {
        const content = nodesToMathjs(node.content, angleMode);
        out += ` (${content}) `;
        break;
      }
      case 'subscript': {
        const base = nodesToMathjs(node.base, angleMode);
        out += ` ${base} `;
        break;
      }
      case 'integral':
      case 'summation': {
        out += ' 0 '; // Handled by calculus/sequence engines specifically
        break;
      }
    }
  }
  return out;
}

// Helper to find and mutate a list in place
export function insertAtTarget(
  nodes: BoxNode[], 
  target: ActiveTarget, 
  itemToInsert: BoxNode | BoxNode[]
): { updatedNodes: BoxNode[]; newTarget: ActiveTarget } {
  const items = Array.isArray(itemToInsert) ? itemToInsert : [itemToInsert];
  const deepCopy: BoxNode[] = JSON.parse(JSON.stringify(nodes));

  if (target.nodeId === 'root') {
    const idx = Math.min(Math.max(0, target.index), deepCopy.length);
    deepCopy.splice(idx, 0, ...items);
    return {
      updatedNodes: deepCopy,
      newTarget: { nodeId: 'root', slot: 'root', index: idx + items.length }
    };
  }

  let found = false;
  let newTarget = { ...target };

  function traverse(list: BoxNode[]) {
    for (const node of list) {
      if (node.id === target.nodeId) {
        found = true;
        let slotList: BoxNode[] | undefined;
        if (node.type === 'fraction') {
          slotList = target.slot === 'num' ? node.num : node.den;
        } else if (node.type === 'power') {
          slotList = target.slot === 'base' ? node.base : node.exp;
        } else if (node.type === 'sqrt') {
          slotList = node.content;
        } else if (node.type === 'nroot') {
          slotList = target.slot === 'degree' ? node.degree : node.content;
        } else if (node.type === 'function') {
          slotList = node.arg;
        } else if (node.type === 'abs' || node.type === 'parens') {
          slotList = node.content;
        }

        if (slotList) {
          const idx = Math.min(Math.max(0, target.index), slotList.length);
          slotList.splice(idx, 0, ...items);
          newTarget.index = idx + items.length;
        }
        return;
      }

      // recurse
      if (node.type === 'fraction') {
        traverse(node.num);
        if (!found) traverse(node.den);
      } else if (node.type === 'power') {
        traverse(node.base);
        if (!found) traverse(node.exp);
      } else if (node.type === 'sqrt' || node.type === 'abs' || node.type === 'parens') {
        traverse(node.content);
      } else if (node.type === 'nroot') {
        traverse(node.degree);
        if (!found) traverse(node.content);
      } else if (node.type === 'function') {
        traverse(node.arg);
      }
      if (found) return;
    }
  }

  traverse(deepCopy);
  return { updatedNodes: deepCopy, newTarget };
}

// Backspace deletion
export function deleteAtTarget(
  nodes: BoxNode[],
  target: ActiveTarget
): { updatedNodes: BoxNode[]; newTarget: ActiveTarget } {
  const deepCopy: BoxNode[] = JSON.parse(JSON.stringify(nodes));

  if (target.nodeId === 'root') {
    if (target.index > 0 && target.index <= deepCopy.length) {
      deepCopy.splice(target.index - 1, 1);
      return {
        updatedNodes: deepCopy,
        newTarget: { nodeId: 'root', slot: 'root', index: target.index - 1 }
      };
    }
    return { updatedNodes: deepCopy, newTarget: target };
  }

  let newTarget = { ...target };

  function traverseAndDel(list: BoxNode[], parent: BoxNode | null, slotName: string): boolean {
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (node.id === target.nodeId) {
        let slotList: BoxNode[] | undefined;
        if (node.type === 'fraction') slotList = target.slot === 'num' ? node.num : node.den;
        else if (node.type === 'power') slotList = target.slot === 'base' ? node.base : node.exp;
        else if (node.type === 'sqrt' || node.type === 'abs' || node.type === 'parens') slotList = node.content;
        else if (node.type === 'nroot') slotList = target.slot === 'degree' ? node.degree : node.content;
        else if (node.type === 'function') slotList = node.arg;

        if (slotList) {
          if (target.index > 0 && target.index <= slotList.length) {
            slotList.splice(target.index - 1, 1);
            newTarget.index = target.index - 1;
            return true;
          } else if (slotList.length === 0) {
            // Empty box - delete entire construct and exit to parent
            list.splice(i, 1);
            newTarget = { nodeId: parent ? parent.id : 'root', slot: slotName as any, index: i };
            return true;
          }
        }
        return true;
      }

      if (node.type === 'fraction') {
        if (traverseAndDel(node.num, node, 'num')) return true;
        if (traverseAndDel(node.den, node, 'den')) return true;
      } else if (node.type === 'power') {
        if (traverseAndDel(node.base, node, 'base')) return true;
        if (traverseAndDel(node.exp, node, 'exp')) return true;
      } else if (node.type === 'sqrt' || node.type === 'abs' || node.type === 'parens') {
        if (traverseAndDel(node.content, node, 'content')) return true;
      } else if (node.type === 'nroot') {
        if (traverseAndDel(node.degree, node, 'degree')) return true;
        if (traverseAndDel(node.content, node, 'content')) return true;
      } else if (node.type === 'function') {
        if (traverseAndDel(node.arg, node, 'arg')) return true;
      }
    }
    return false;
  }

  traverseAndDel(deepCopy, null, 'root');
  return { updatedNodes: deepCopy, newTarget };
}
