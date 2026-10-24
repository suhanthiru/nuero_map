// Pretty-print minified JS with the TypeScript printer (parse only, never executes input).
// Strips source positions so every block prints multi-line, and splits statement-level
// comma sequences (`a(), b(), c()` / `return a, b`) into separate statements.
// usage: node pretty.js <tsPath> <in.js> <out.js>
const [tsPath, input, output] = process.argv.slice(2);
const ts = require(tsPath);
const fs = require('fs');
const f = ts.factory;
const text = fs.readFileSync(input, 'utf8');
const sf = ts.createSourceFile(input, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

function flattenComma(e, out) {
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    flattenComma(e.left, out); flattenComma(e.right, out);
  } else out.push(e);
  return out;
}
function strip(n) { ts.setTextRange(n, { pos: -1, end: -1 }); return n; }

const transformer = ctx => {
  const visit = node => {
    let n = ts.visitEachChild(node, visit, ctx);
    if (ts.isExpressionStatement(n)) {
      const parts = flattenComma(n.expression, []);
      if (parts.length > 1) return parts.map(p => strip(f.createExpressionStatement(p)));
    }
    if (ts.isReturnStatement(n) && n.expression) {
      const parts = flattenComma(n.expression, []);
      if (parts.length > 1) {
        const last = parts.pop();
        return [...parts.map(p => strip(f.createExpressionStatement(p))), strip(f.createReturnStatement(last))];
      }
    }
    if (ts.isObjectLiteralExpression(n) && n.properties.length > 3) {
      n = f.updateObjectLiteralExpression(n, n.properties); n.multiLine = true;
    }
    if (ts.isBlock(n)) { n = f.createBlock(n.statements, true); }
    return strip(n);
  };
  return root => ts.visitEachChild(root, visit, ctx);
};

const result = ts.transform(sf, [transformer]);
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
fs.writeFileSync(output, printer.printFile(result.transformed[0]));
console.log(input.split(/[\\/]/).pop(), '->', fs.statSync(output).size, 'bytes');
