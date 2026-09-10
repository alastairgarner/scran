const rules = [
  {
    name: 'arbitrary visual value',
    pattern:
      /\b(?:bg|text|border(?:-[trblxyse]+)?|ring|outline|fill|stroke|rounded(?:-[trblxyse]+)?|shadow|font|tracking|leading)-\[[^\]]+\]/g,
  },
  {
    name: 'raw palette utility',
    pattern:
      /\b(?:bg|text|border(?:-[trblxyse]+)?|ring|outline|fill|stroke)-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|paper|rust)(?:-\d+)?(?:\/\d+)?\b/g,
  },
  {
    name: 'uncontrolled typography',
    pattern:
      /\b(?:text-(?:xs|sm|base|lg|xl|[2-9]xl|small|body|title)|font-(?!(?:bold|semibold)\b)[a-z][\w-]*|tracking-[\w-]+|leading-[\w-]+)\b/g,
  },
  {
    name: 'spacing outside the scale',
    pattern:
      /(?<![\w-])-?(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy])-(?!(?:0|1|2|3|4|6|8|12|16)\b)\d+(?:\.\d+)?\b/g,
  },
  {
    name: 'arbitrary spacing',
    pattern:
      /(?<![\w-])-?(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy])-\[[^\]]+\]/g,
  },
];

let failed = false;

for await (const file of new Bun.Glob('client/src/**/*.{ts,tsx}').scan()) {
  const source = await Bun.file(file).text();

  for (const rule of rules) {
    for (const match of source.matchAll(rule.pattern)) {
      const line = source.slice(0, match.index).split('\n').length;

      process.stderr.write(`${file}:${line}: ${rule.name}: ${match[0]}\n`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
