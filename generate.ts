#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { marked } from "marked";

type Article = {
  name: string;
  title: string;
  date: string;
  change?: string;
};

const root = new URL(".", import.meta.url);
const source = new URL("src/", root);
const output = new URL("output/", root);
const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (character) => entities[character]);

const render = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key]);

const read = (file: string) => readFile(new URL(file, root), "utf8");

async function main() {
  const articles = JSON.parse(await read("ArticleList.json")) as Article[];
  const requested = process.argv[2];
  const targets = requested
    ? articles.filter(({ name }) => name === requested)
    : articles;
  if (requested && !targets.length)
    throw new Error(`Unknown article: ${requested}`);
  const [indexTemplate, articleTemplate] = await Promise.all([
    read("index.tpl.html"),
    read("Article.tpl.html"),
  ]);
  await mkdir(output, { recursive: true });

  console.log(`Generating articles\n${targets.length} needs generating`);
  await Promise.all(
    targets.map(async (article) => {
      const markdown = await readFile(
        new URL(`${article.name}.md`, source),
        "utf8",
      );
      const html = render(articleTemplate, {
        title: escape(article.title),
        content: await marked.parse(markdown, { gfm: true }),
        date: article.date,
        change: article.change
          ? `<br>Last Change: ${escape(article.change)}`
          : "",
      });
      await writeFile(new URL(`${article.name}.html`, output), html);
      console.log(`Generating ${article.name}...Done`);
    }),
  );

  const articlesHtml = [...articles]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      ({ name, title }) =>
        `<li><a href="${encodeURI(`${name}.html`)}">${escape(title)}</a></li>`,
    )
    .join("\n");
  await writeFile(
    new URL("index.html", output),
    render(indexTemplate, { articles: articlesHtml }),
  );
  console.log("Generating index.html...Done");
}

main().catch((error: unknown) => {
  console.error(
    `Generation failed: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
});
