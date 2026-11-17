import {
  ASTNode,
  FragmentDefinitionNode,
  GraphQLError,
  Kind,
  OperationDefinitionNode,
  SelectionSetNode,
  ValidationContext,
  ValidationRule,
} from 'graphql';

/**
 * Rejects queries nested deeper than `maxDepth`, protecting the API from
 * deliberately expensive queries (book → copies → loans → member → loans …).
 */
export function depthLimit(maxDepth: number): ValidationRule {
  return (context: ValidationContext) => {
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const def of context.getDocument().definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
    }

    const measure = (set: SelectionSetNode | undefined, depth: number, seen: Set<string>): number => {
      if (!set) return depth;
      let max = depth;
      for (const sel of set.selections) {
        if (sel.kind === Kind.FIELD) {
          if (sel.name.value.startsWith('__')) continue; // introspection
          max = Math.max(max, measure(sel.selectionSet, depth + 1, seen));
        } else if (sel.kind === Kind.INLINE_FRAGMENT) {
          max = Math.max(max, measure(sel.selectionSet, depth, seen));
        } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
          const name = sel.name.value;
          if (seen.has(name)) continue;
          const frag = fragments.get(name);
          max = Math.max(max, measure(frag?.selectionSet, depth, new Set([...seen, name])));
        }
      }
      return max;
    };

    return {
      OperationDefinition(node: OperationDefinitionNode) {
        const depth = measure(node.selectionSet, 0, new Set());
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`Query is too deeply nested (${depth} levels, max ${maxDepth}).`, {
              nodes: [node as ASTNode],
              extensions: { code: 'QUERY_TOO_DEEP' },
            }),
          );
        }
      },
    };
  };
}
