// Build a class/export inventory from a pretty-printed webpack+TS-downlevel bundle.
// Parses only; never executes the input.
// usage: node classmap.js <tsPath> <pretty.js> <outPrefix>
const [tsPath, input, outPrefix] = process.argv.slice(2);
const ts = require(tsPath);
const fs = require('fs');
const text = fs.readFileSync(input, 'utf8');
const sf = ts.createSourceFile(input, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const endLine = n => sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1;

// 1. webpack export maps: n.d(x, { Name: () => ident, ... })
const exportMaps = [];
const apiName = new Map(); // minified ident -> [exported names]
function visitExports(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'd' && node.arguments.length === 2 &&
      ts.isObjectLiteralExpression(node.arguments[1])) {
    const entries = [];
    for (const p of node.arguments[1].properties) {
      if (ts.isPropertyAssignment(p) && ts.isArrowFunction(p.initializer) && ts.isIdentifier(p.initializer.body)) {
        const ex = p.name.text || p.name.getText(sf);
        const id = p.initializer.body.text;
        entries.push([ex, id]);
      }
    }
    if (entries.length) {
      exportMaps.push({ line: line(node), target: node.arguments[0].getText(sf), entries });
    }
  }
  ts.forEachChild(node, visitExports);
}
visitExports(sf);

// 2. classes: TS downlevel IIFE pattern and native class syntax
const classes = [];
function isIIFE(init) {
  if (!init || !ts.isCallExpression(init)) return null;
  let callee = init.expression;
  while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
  if (!ts.isFunctionExpression(callee)) return null;
  return callee;
}
function collectDownlevel(name, fn, call, node) {
  const methods = [], statics = [], fields = new Set();
  let inner = null;
  const base = call.arguments[0] ? call.arguments[0].getText(sf) : null;
  for (const st of fn.body.statements) {
    if (ts.isFunctionDeclaration(st) && !inner) inner = st;
    if (ts.isExpressionStatement(st) && ts.isBinaryExpression(st.expression) &&
        st.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const lhs = st.expression.left;
      if (ts.isPropertyAccessExpression(lhs)) {
        const obj = lhs.expression;
        if (ts.isPropertyAccessExpression(obj) && obj.name.text === 'prototype') methods.push(lhs.name.text);
        else if (ts.isIdentifier(obj) && inner && obj.text === inner.name?.text) statics.push(lhs.name.text);
      }
    }
    // Object.defineProperty(t.prototype, "name", {get...})
    if (ts.isExpressionStatement(st) && ts.isCallExpression(st.expression) &&
        st.expression.expression.getText(sf) === 'Object.defineProperty' && st.expression.arguments.length >= 2) {
      const a0 = st.expression.arguments[0].getText(sf), a1 = st.expression.arguments[1];
      if (ts.isStringLiteral(a1)) (a0.endsWith('.prototype') ? methods : statics).push((a0.endsWith('.prototype') ? 'get ' : 'static get ') + a1.text);
    }
  }
  if (!inner) return false;
  if (!methods.length && !statics.length && !base) {
    // still treat as class if constructor assigns this.*
  }
  const selfNames = new Set(['this']);
  (function walk(n) {
    if (ts.isVariableDeclaration(n) && n.initializer && /\.call\(this|\.apply\(this/.test(n.initializer.getText(sf)) && ts.isIdentifier(n.name)) selfNames.add(n.name.text);
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left)) {
      const o = n.left.expression;
      if (o.kind === ts.SyntaxKind.ThisKeyword || (ts.isIdentifier(o) && selfNames.has(o.text))) fields.add(n.left.name.text);
    }
    if (n !== inner && (ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n))) return;
    ts.forEachChild(n, walk);
  })(inner);
  if (!methods.length && !fields.size && !base) return false;
  classes.push({ name, line: line(node), end: endLine(node), kind: 'downlevel', base, ctorParams: inner.parameters.length, fields: [...fields], methods, statics });
  return true;
}
function collectNative(name, cls, node) {
  const methods = [], statics = [], fields = new Set();
  for (const m of cls.members) {
    const nm = m.name ? m.name.getText(sf) : '(ctor)';
    const isStatic = m.modifiers?.some(x => x.kind === ts.SyntaxKind.StaticKeyword);
    if (ts.isConstructorDeclaration(m)) {
      (function walk(n) {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && n.left.expression.kind === ts.SyntaxKind.ThisKeyword) fields.add(n.left.name.text);
        ts.forEachChild(n, walk);
      })(m);
      continue;
    }
    const prefix = ts.isGetAccessor(m) ? 'get ' : ts.isSetAccessor(m) ? 'set ' : '';
    if (ts.isPropertyDeclaration(m)) { fields.add(nm); continue; }
    (isStatic ? statics : methods).push(prefix + nm);
  }
  const base = cls.heritageClauses?.[0]?.types?.[0]?.getText(sf) || null;
  classes.push({ name, line: line(node), end: endLine(node), kind: 'class', base, fields: [...fields], methods, statics });
}
function visitClasses(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    const fn = isIIFE(node.initializer);
    if (fn) collectDownlevel(node.name.text, fn, node.initializer, node);
    else if (ts.isClassExpression(node.initializer)) collectNative(node.name.text, node.initializer, node);
  }
  if (ts.isClassDeclaration(node) && node.name) collectNative(node.name.text, node, node);
  ts.forEachChild(node, visitClasses);
}
visitClasses(sf);

for (const m of exportMaps) for (const [ex, id] of m.entries) {
  if (!apiName.has(id)) apiName.set(id, new Set());
  apiName.get(id).add(ex);
}
const named = id => apiName.has(id) ? [...apiName.get(id)].join('|') : '';
fs.writeFileSync(outPrefix + '.exports.json', JSON.stringify(exportMaps, null, 1));
fs.writeFileSync(outPrefix + '.classes.json', JSON.stringify(classes.map(c => ({ ...c, api: named(c.name), baseApi: c.base ? named(c.base) : '' })), null, 1));
const rows = classes.map(c => [c.line, c.end, c.name, named(c.name), c.base || '', c.base ? named(c.base) : '', c.fields.join(','), c.methods.join(','), c.statics.join(',')].join('\t'));
fs.writeFileSync(outPrefix + '.classes.tsv', 'line\tend\tid\tapi\tbase\tbaseApi\tfields\tmethods\tstatics\n' + rows.join('\n'));
const exRows = []; for (const m of exportMaps) for (const [ex, id] of m.entries) exRows.push([m.line, m.target, ex, id].join('\t'));
fs.writeFileSync(outPrefix + '.exports.tsv', 'mapLine\tmap\texport\tid\n' + exRows.join('\n'));
console.log('export maps', exportMaps.length, 'exports', exRows.length, 'classes', classes.length, 'named classes', classes.filter(c => apiName.has(c.name)).length);
