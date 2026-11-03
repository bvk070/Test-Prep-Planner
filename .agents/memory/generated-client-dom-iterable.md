---
name: Generated client DOM iterable types
description: TypeScript library settings needed by generated browser fetch clients
---

When Orval output uses `Headers.entries()`, the API client library must include both `dom` and `dom.iterable` in its TypeScript `lib` setting.

**Why:** Orval generation can complete while the chained workspace typecheck fails because the standard `Headers` type omits iterable methods without `DOM.Iterable`.

**How to apply:** If generated client code reports that `Headers.entries` does not exist, add `dom.iterable` to the API client library's `lib` array, then rerun codegen and typecheck.
