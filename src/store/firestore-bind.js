// Minimal replacement for vuexfire's `firestoreAction` (vuexfire has no Vue 3
// release). Keeps the same API used by the stores:
//
//   bindThing: firestoreAction(({ bindFirestoreRef }, arg) =>
//     bindFirestoreRef("stateKey", queryOrDocRef, { wait: true })),
//   unbindThing: firestoreAction(({ unbindFirestoreRef }) =>
//     unbindFirestoreRef("stateKey", reset)),
//
// Documents are stored as plain objects with a non-enumerable `id`, as vuexfire did.
import { onSnapshot, DocumentReference } from "firebase/firestore";

export const FIRESTORE_SET = "firestoreSet";

// Root mutation; register in the store's root `mutations`.
export const firestoreMutations = {
  [FIRESTORE_SET](_state, { target, key, value }) {
    target[key] = value;
  }
};

const listeners = new WeakMap(); // module state object -> Map(key -> unsubscribe)

function toData(snap) {
  if (!snap.exists()) return null;
  const data = snap.data();
  Object.defineProperty(data, "id", { value: snap.id, enumerable: false });
  return data;
}

function getListenerMap(state) {
  let map = listeners.get(state);
  if (!map) {
    map = new Map();
    listeners.set(state, map);
  }
  return map;
}

function unbind(state, commit, key, reset = true) {
  const map = getListenerMap(state);
  const unsubscribe = map.get(key);
  if (unsubscribe) {
    unsubscribe();
    map.delete(key);
  }
  if (reset) {
    const value = Array.isArray(state[key]) ? [] : null;
    commit(FIRESTORE_SET, { target: state, key, value }, { root: true });
  }
}

export function firestoreAction(action) {
  return function(context, payload) {
    const { state, commit } = context;

    const bindFirestoreRef = (key, ref, options = {}) => {
      unbind(state, commit, key, options.reset === true);
      const isDoc = ref instanceof DocumentReference;

      return new Promise((resolve, reject) => {
        let first = true;
        const unsubscribe = onSnapshot(
          ref,
          snap => {
            const value = isDoc ? toData(snap) : snap.docs.map(toData);
            commit(FIRESTORE_SET, { target: state, key, value }, { root: true });
            if (first) {
              first = false;
              resolve(value);
            }
          },
          error => {
            if (first) {
              first = false;
              reject(error);
            } else {
              console.error(`Firestore listener "${key}" failed:`, error);
            }
          }
        );
        getListenerMap(state).set(key, unsubscribe);
      });
    };

    const unbindFirestoreRef = (key, reset = true) =>
      unbind(state, commit, key, reset);

    return action.call(
      this,
      { ...context, bindFirestoreRef, unbindFirestoreRef },
      payload
    );
  };
}
