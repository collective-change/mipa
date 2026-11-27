// Firestore real-time binding helper for Pinia stores (and transitional Vuex modules).
// Keeps the declarative API used by the stores:
//
//   bindThing: firestoreAction(({ bindFirestoreRef }, arg) =>
//     bindFirestoreRef("stateKey", queryOrDocRef, { wait: true })),
//   unbindThing: firestoreAction(({ unbindFirestoreRef }) =>
//     unbindFirestoreRef("stateKey", reset)),
//
// Documents are stored as plain objects with a non-enumerable `id`.
import { onSnapshot, DocumentReference } from "firebase/firestore";

export const FIRESTORE_SET = "firestoreSet";

// Transitional root mutation for remaining Vuex modules (removed in Wave 4).
export const firestoreMutations = {
  [FIRESTORE_SET](_state, { target, key, value }) {
    target[key] = value;
  }
};

const listeners = new WeakMap(); // state object -> Map(key -> unsubscribe)

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

function unbindPinia(store, key, reset = true) {
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

function unbindVuex(state, applySet, key, reset = true) {
  const map = getListenerMap(state);
  const unsubscribe = map.get(key);
  if (unsubscribe) {
    unsubscribe();
    map.delete(key);
  }
  if (reset) {
    const value = Array.isArray(state[key]) ? [] : null;
    applySet(key, value);
  }
}

export function firestoreAction(action) {
  return function (...args) {
    const isPinia = Boolean(this && typeof this.$id === "string" && this.$state);

    if (isPinia) {
      const store = this;
      const payload = args[0];

      const bindFirestoreRef = (key, ref, options = {}) => {
        unbindPinia(store, key, options.reset === true);
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

      const unbindFirestoreRef = (key, reset = true) =>
        unbindPinia(store, key, reset);

      return action.call(
        store,
        { state: store.$state, store, bindFirestoreRef, unbindFirestoreRef },
        payload
      );
    }

    // Transitional Vuex path for not-yet-converted modules
    const [context, payload] = args;
    const { state } = context;
    const applySet = (key, value) => {
      if (typeof context.commit === "function") {
        context.commit(FIRESTORE_SET, { target: state, key, value }, { root: true });
      } else {
        state[key] = value;
      }
    };

    const bindFirestoreRef = (key, ref, options = {}) => {
      unbindVuex(state, applySet, key, options.reset === true);
      const isDoc = ref instanceof DocumentReference;

      return new Promise((resolve, reject) => {
        let first = true;
        const unsubscribe = onSnapshot(
          ref,
          (snap) => {
            const value = isDoc ? toData(snap) : snap.docs.map(toData);
            applySet(key, value);
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
        getListenerMap(state).set(key, unsubscribe);
      });
    };

    const unbindFirestoreRef = (key, reset = true) =>
      unbindVuex(state, applySet, key, reset);

    return action.call(
      this,
      { ...context, bindFirestoreRef, unbindFirestoreRef },
      payload
    );
  };
}
