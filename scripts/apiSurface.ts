import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Node, Project, ts, type JSDocableNode, type SourceFile } from "ts-morph";

export interface ApiCapability {
  slug: string;
  intent: string;
}

export interface ApiExport {
  name: string;
  kind: string;
  signature: string;
  doc?: string;
  capabilities?: ApiCapability[];
}

export interface ApiModule {
  path: string;
  exports: ApiExport[];
}

export interface ApiPackage {
  name: string;
  description: string;
  version: string;
  modules: ApiModule[];
}

const MAX_SIGNATURE_LENGTH = 300;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripImportQualifiers(text: string): string {
  return text.replace(/import\("[^"]+"\)\./g, "");
}

function truncate(text: string): string {
  const collapsed = collapseWhitespace(stripImportQualifiers(text));
  return collapsed.length > MAX_SIGNATURE_LENGTH ? `${collapsed.slice(0, MAX_SIGNATURE_LENGTH)}…` : collapsed;
}

function firstDocParagraph(node: JSDocableNode): string | undefined {
  const [doc] = node.getJsDocs();
  if (doc === undefined) return undefined;
  const description = doc.getDescription().trim();
  if (description === "") return undefined;
  const [paragraph] = description.split(/\n\s*\n/);
  return collapseWhitespace(paragraph ?? "");
}

function isInternal(node: JSDocableNode): boolean {
  return node.getJsDocs().some((doc) => doc.getTags().some((tag) => tag.getTagName() === "internal"));
}

function capabilityTags(node: JSDocableNode): ApiCapability[] | undefined {
  const capabilities: ApiCapability[] = [];
  for (const doc of node.getJsDocs()) {
    for (const tag of doc.getTags()) {
      if (tag.getTagName() !== "capability") continue;
      const text = collapseWhitespace(tag.getCommentText() ?? "");
      const [slug, ...rest] = text.split(/\s+/);
      if (slug === undefined || slug === "") continue;
      capabilities.push({ slug, intent: rest.join(" ") });
    }
  }
  return capabilities.length > 0 ? capabilities : undefined;
}

function functionSignature(name: string, decl: Node): string {
  if (!Node.isFunctionDeclaration(decl)) return truncate(decl.getText());
  const typeParams = decl.getTypeParameters().map((tp) => tp.getText());
  const params = decl.getParameters().map((p) => p.getText());
  const returnType = decl.getReturnTypeNode()?.getText() ?? decl.getReturnType().getText();
  const generics = typeParams.length > 0 ? `<${typeParams.join(", ")}>` : "";
  return truncate(`function ${name}${generics}(${params.join(", ")}): ${returnType}`);
}

function generics(typeParams: readonly Node[]): string {
  return typeParams.length > 0 ? `<${typeParams.map((tp) => tp.getText()).join(", ")}>` : "";
}

function classSignature(decl: Node): string {
  if (!Node.isClassDeclaration(decl)) return truncate(decl.getText());
  const name = decl.getName() ?? "";
  const extendsClause = decl.getExtends();
  const implementsClause = decl.getImplements();
  const extendsText = extendsClause !== undefined ? ` extends ${extendsClause.getText()}` : "";
  const implementsText = implementsClause.length > 0 ? ` implements ${implementsClause.map((i) => i.getText()).join(", ")}` : "";
  return truncate(`class ${name}${generics(decl.getTypeParameters())}${extendsText}${implementsText}`);
}

function interfaceSignature(decl: Node): string {
  if (!Node.isInterfaceDeclaration(decl)) return truncate(decl.getText());
  const name = decl.getName();
  const extendsClause = decl.getExtends();
  const extendsText = extendsClause.length > 0 ? ` extends ${extendsClause.map((e) => e.getText()).join(", ")}` : "";
  return truncate(`interface ${name}${generics(decl.getTypeParameters())}${extendsText}`);
}

function typeSignature(decl: Node): string {
  if (!Node.isTypeAliasDeclaration(decl)) return truncate(decl.getText());
  const typeText = decl.getTypeNode()?.getText() ?? decl.getType().getText();
  return truncate(`type ${decl.getName()}${generics(decl.getTypeParameters())} = ${typeText}`);
}

function enumSignature(decl: Node): string {
  if (!Node.isEnumDeclaration(decl)) return truncate(decl.getText());
  return truncate(`${decl.isConstEnum() ? "const enum" : "enum"} ${decl.getName()}`);
}

function constSignature(decl: Node): string {
  if (!Node.isVariableDeclaration(decl)) return truncate(decl.getText());
  const typeText = decl.getTypeNode()?.getText() ?? decl.getType().getText();
  return truncate(`const ${decl.getName()}: ${typeText}`);
}

function moduleExports(sourceFile: SourceFile): ApiExport[] {
  const exports: ApiExport[] = [];
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    if (name.startsWith("_")) continue;
    const decl = declarations[0];
    if (decl === undefined) continue;

    if (Node.isFunctionDeclaration(decl)) {
      if (isInternal(decl)) continue;
      exports.push({ name, kind: "function", signature: functionSignature(name, decl), doc: firstDocParagraph(decl), capabilities: capabilityTags(decl) });
    } else if (Node.isClassDeclaration(decl)) {
      if (isInternal(decl)) continue;
      exports.push({ name, kind: "class", signature: classSignature(decl), doc: firstDocParagraph(decl), capabilities: capabilityTags(decl) });
    } else if (Node.isInterfaceDeclaration(decl)) {
      if (isInternal(decl)) continue;
      exports.push({ name, kind: "interface", signature: interfaceSignature(decl), doc: firstDocParagraph(decl), capabilities: capabilityTags(decl) });
    } else if (Node.isTypeAliasDeclaration(decl)) {
      if (isInternal(decl)) continue;
      exports.push({ name, kind: "type", signature: typeSignature(decl), doc: firstDocParagraph(decl), capabilities: capabilityTags(decl) });
    } else if (Node.isEnumDeclaration(decl)) {
      if (isInternal(decl)) continue;
      exports.push({ name, kind: "enum", signature: enumSignature(decl), doc: firstDocParagraph(decl), capabilities: capabilityTags(decl) });
    } else if (Node.isVariableDeclaration(decl)) {
      const statement = decl.getVariableStatement();
      if (statement !== undefined && isInternal(statement)) continue;
      exports.push({
        name,
        kind: "const",
        signature: constSignature(decl),
        doc: statement !== undefined ? firstDocParagraph(statement) : undefined,
        capabilities: statement !== undefined ? capabilityTags(statement) : undefined,
      });
    }
  }
  exports.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return exports;
}

export function extractPackageSurface(packageDir: string): ApiPackage {
  const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
    name: string;
    description?: string;
    version: string;
  };

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      skipLibCheck: true,
    },
  });
  project.addSourceFilesAtPaths([
    join(packageDir, "src", "**", "*.ts"),
    join(packageDir, "src", "**", "*.tsx"),
    `!${join(packageDir, "src", "**", "*.test.ts")}`,
    `!${join(packageDir, "src", "**", "*.test.tsx")}`,
  ]);

  const srcDir = join(packageDir, "src");
  const modules: ApiModule[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    const exports = moduleExports(sourceFile);
    if (exports.length === 0) continue;
    const rel = relative(srcDir, sourceFile.getFilePath()).replace(/\\/g, "/");
    const path = rel.replace(/\.tsx?$/, "");
    modules.push({ path, exports });
  }
  modules.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    name: packageJson.name,
    description: packageJson.description ?? "",
    version: packageJson.version,
    modules,
  };
}
