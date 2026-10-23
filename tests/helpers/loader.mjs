export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@neondatabase/serverless') {
    return { url: new URL('./neon-pglite.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
