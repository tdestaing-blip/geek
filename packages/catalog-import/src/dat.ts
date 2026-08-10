export type DatNode = {
  readonly name: string;
  readonly value: string | null;
  readonly children: readonly DatNode[];
};

/** Parses the small clrmamepro S-expression surface used by Libretro DATs. */
export function parseDat(source: string): readonly DatNode[] {
  const tokens = tokenize(source);
  let position = 0;

  function parseNodes(untilClose: boolean): DatNode[] {
    const nodes: DatNode[] = [];

    while (position < tokens.length) {
      const name = tokens[position];

      if (name === ")") {
        if (!untilClose) {
          throw new SyntaxError("unexpected closing parenthesis in DAT source");
        }

        position += 1;
        return nodes;
      }

      if (name === "(" || name === undefined) {
        throw new SyntaxError("expected a field name in DAT source");
      }

      position += 1;

      if (tokens[position] === "(") {
        position += 1;
        nodes.push({ name, value: null, children: parseNodes(true) });
        continue;
      }

      const value = tokens[position];

      if (value === undefined || value === ")" || value === "(") {
        throw new SyntaxError(`expected a value for DAT field ${name}`);
      }

      position += 1;
      nodes.push({ name, value, children: [] });
    }

    if (untilClose) {
      throw new SyntaxError("unterminated parenthesized DAT record");
    }

    return nodes;
  }

  return parseNodes(false);
}

export function childValues(node: DatNode, name: string): string[] {
  return node.children.flatMap((child) =>
    child.name === name && child.value !== null ? [child.value] : [],
  );
}

export function childNodes(node: DatNode, name: string): DatNode[] {
  return node.children.filter((child) => child.name === name && child.value === null);
}

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let position = 0;

  while (position < source.length) {
    const character = source[position];

    if (character === undefined) break;

    if (/\s/u.test(character)) {
      position += 1;
      continue;
    }

    if (character === "#") {
      while (position < source.length && source[position] !== "\n") position += 1;
      continue;
    }

    if (character === "(" || character === ")") {
      tokens.push(character);
      position += 1;
      continue;
    }

    if (character === '"') {
      const parsed = readQuoted(source, position + 1);
      tokens.push(parsed.value);
      position = parsed.position;
      continue;
    }

    const start = position;

    while (
      position < source.length &&
      !/\s/u.test(source[position] ?? "") &&
      source[position] !== "(" &&
      source[position] !== ")"
    ) {
      position += 1;
    }

    tokens.push(source.slice(start, position));
  }

  return tokens;
}

function readQuoted(
  source: string,
  start: number,
): { readonly value: string; readonly position: number } {
  let value = "";
  let position = start;

  while (position < source.length) {
    const character = source[position];

    if (character === '"') {
      return { value, position: position + 1 };
    }

    if (character === "\\" && source[position + 1] !== undefined) {
      value += source[position + 1];
      position += 2;
      continue;
    }

    value += character;
    position += 1;
  }

  throw new SyntaxError("unterminated quoted DAT value");
}
