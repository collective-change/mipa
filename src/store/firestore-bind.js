// Firestore real-time binding helper for Pinia stores.
// Keeps the declarative API used by the stores:
//
//   bindThing: firestoreAction(({ bindFirestoreRef }, arg) =>
//     bindFirestoreRef("stateKey", queryOrDocRef, { wait: true })),
//   unbindThing: firestoreAction(({ unbindFirestoreRef }) =>
//     unbindFirestoreRef("stateKey", reset)),
//
// The wrapped action runs with `this` bound to the store, so a `function`
// (not an arrow) can call other actions via `this`.
// Documents are stored as plain objects with a non-enumerable `id`.
import { onSnapshot, DocumentReference } from "firebase/firestore";

const listeners = new WeakMap(); // store state object -> Map(key -> unsubscribe)

function toData(snap) {
  if (!snap.exists()) return null;
  const data = snap.data();
  Object.defineProperty(data, "id", { value: snap.id, enumerable: false });
  return data;
}

function getListenerMap(stateKeyObj) {
  let map = listeners.get(stateKeyObj);
  if (!map) {
    map = new Map();
    listeners.set(stateKeyObj, map);
  }
  return map;
}

function unbind(store, key, reset = true) {
  const map = getListenerMap(store.$state);
  const unsubscribe = map.get(key);
  if (unsubscribe) {
    unsubscribe();
    map.delete(key);
  }
  if (reset) {
    const value = Array.isArray(store[key]) ? [] : null;
    store[key] = value;
  }
}

export function firestoreAction(action) {
  return function (payload) {
    const store = this;

    const bindFirestoreRef = (key, ref, options = {}) => {
      unbind(store, key, options.reset === true);
      const isDoc = ref instanceof DocumentReference;

      return new Promise((resolve, reject) => {
        let first = true;
        const unsubscribe = onSnapshot(
          ref,
          (snap) => {
            const value = isDoc ? toData(snap) : snap.docs.map(toData);
            store[key] = value;
            if (first) {
              first = false;
              resolve(value);
            }
          },
          (error) => {
            if (first) {
              first = false;
              reject(error);
            } else {
              console.error(`Firestore listener "${key}" failed:`, error);
            }
          }
        );
        getListenerMap(store.$state).set(key, unsubscribe);
      });
    };

    const unbindFirestoreRef = (key, reset = true) => unbind(store, key, reset);

    return action.call(
      store,
      { state: store.$state, store, bindFirestoreRef, unbindFirestoreRef },
      payload
    );
  };
}
