import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Source inventory for keeping the application on its shared component system.
const counts = new Map();
const customCorners = [];
let files = 0;
function visitDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visitDirectory(file);
      continue;
    }
    if (!file.endsWith(".tsx")) continue;
    files++;
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName.getText(source);
        if (
          /^(Card|SurfaceCard|SectionCard|DashboardCard|PtHubSectionCard|SettingsSectionCard|StatCard|Button|Input|Select|Textarea|TabsList|Badge|DialogContent|EmptyState)$/.test(
            name,
          )
        ) {
          counts.set(name, (counts.get(name) ?? 0) + 1);
          const classes = node.attributes.properties.find(
            (a) =>
              ts.isJsxAttribute(a) && a.name.getText(source) === "className",
          );
          if (
            classes &&
            /rounded-\[(?:2[1-9]|[3-9]\d)px\]/.test(classes.getText(source))
          ) {
            customCorners.push(
              `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`,
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
visitDirectory("src");
console.log(
  JSON.stringify(
    {
      filesAudited: files,
      sharedComponents: Object.fromEntries([...counts].sort()),
      customCardCorners: customCorners,
    },
    null,
    2,
  ),
);
if (customCorners.length) process.exitCode = 1;
