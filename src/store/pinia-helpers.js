// Options API helper functions for Pinia stores.
// Uses distinct names (pickState, pickWritableState, pickActions, pickUiActionFields)
// and resolves stores with `this?.$pinia` so component unit tests mounting with
// `global: { plugins: [pinia] }` always bind to the wrapper's Pinia instance.

export function pickState(useStore, keysOrMap) {
  const computed = {};
  if (Array.isArray(keysOrMap)) {
    for (const key of keysOrMap) {
      computed[key] = function () {
        return useStore(this?.$pinia)[key];
      };
    }
  } else if (keysOrMap && typeof keysOrMap === "object") {
    for (const [localKey, storeKeyOrFn] of Object.entries(keysOrMap)) {
      if (typeof storeKeyOrFn === "function") {
        computed[localKey] = function () {
          return storeKeyOrFn.call(this, useStore(this?.$pinia));
        };
      } else {
        computed[localKey] = function () {
          return useStore(this?.$pinia)[storeKeyOrFn];
        };
      }
    }
  }
  return computed;
}

export function pickWritableState(useStore, keysOrMap) {
  const computed = {};
  const entries = Array.isArray(keysOrMap)
    ? keysOrMap.map((k) => [k, k])
    : Object.entries(keysOrMap || {});
  for (const [localKey, storeKey] of entries) {
    computed[localKey] = {
      get() {
        return useStore(this?.$pinia)[storeKey];
      },
      set(value) {
        useStore(this?.$pinia)[storeKey] = value;
      }
    };
  }
  return computed;
}

export function pickActions(useStore, keysOrMap) {
  const methods = {};
  const entries = Array.isArray(keysOrMap)
    ? keysOrMap.map((k) => [k, k])
    : Object.entries(keysOrMap || {});
  for (const [localKey, actionName] of entries) {
    methods[localKey] = function (...args) {
      return useStore(this?.$pinia)[actionName](...args);
    };
  }
  return methods;
}

export function pickUiActionFields(useUiActionStore, paths) {
  const computed = {};
  for (const rawPath of paths) {
    const fieldName = rawPath.replace(/^uiAction\./, "");
    const propName = fieldName.split(".")[0];
    computed[propName] = {
      get() {
        const store = useUiActionStore(this?.$pinia);
        return store.uiAction ? store.uiAction[fieldName] : undefined;
      },
      set(value) {
        const store = useUiActionStore(this?.$pinia);
        store.updateUiActionField({
          path: `uiAction.${fieldName}`,
          value
        });
      }
    };
  }
  return computed;
}
