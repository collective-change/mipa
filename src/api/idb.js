const DB_NAME = "mipa";
const DB_VERSION = 2;
let DB;

export default {
  async getDb() {
    return new Promise((resolve, reject) => {
      if (DB) {
        return resolve(DB);
      }
      //console.log("OPENING DB", DB);
      let request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = e => {
        console.log("Error opening db", e);
        reject("Error");
      };

      request.onsuccess = e => {
        DB = e.target.result;
        resolve(DB);
      };

      request.onupgradeneeded = e => {
        console.log("onupgradeneeded");
        let db = e.target.result;
        db.createObjectStore("baselines");
        db.createObjectStore("resultsOfActions");
        db.createObjectStore("dependencyGraphDisplay");
      };

      request.onupgradeneeded = function(event) {
        //db = request.result;
        let db = event.target.result;

        db.onerror = function(errorEvent) {
          note.innerHTML += "<li>Error loading database.</li>";
        };

        if (event.oldVersion < 1) {
          // Version 1 is the first version of the database.
          db.createObjectStore("baselines");
          db.createObjectStore("resultsOfActions");
          /*var store = db.createObjectStore("books", { keyPath: "isbn" });
          var titleIndex = store.createIndex("by_title", "title", { unique: true });
          var authorIndex = store.createIndex("by_author", "author");*/
        }
        if (event.oldVersion < 2) {
          db.createObjectStore("dependencyGraphDisplay", {
            keyPath: "modelId"
          });
          /*var bookStore = request.transaction.objectStore("books");
          var yearIndex = bookStore.createIndex("by_year", "year");*/
        }
      };
    });
  },
  async deleteResultsOfActions(resultsOfActions) {
    let db = await this.getDb();

    return new Promise(resolve => {
      let trans = db.transaction(["resultsOfActions"], "readwrite");
      trans.oncomplete = () => {
        resolve();
      };

      let store = trans.objectStore("resultsOfActions");
      store.delete(resultsOfActions.id);
    });
  },
  async getResultsOfActions() {
    let db = await this.getDb();

    return new Promise(resolve => {
      let trans = db.transaction(["resultsOfActions"], "readonly");
      trans.oncomplete = () => {
        resolve(resultsOfActions);
      };

      let store = trans.objectStore("resultsOfActions");
      let resultsOfActions = [];

      store.openCursor().onsuccess = e => {
        let cursor = e.target.result;
        if (cursor) {
          resultsOfActions.push(cursor.value);
          cursor.continue();
        }
      };
    });
  },

  async getBaseline(key) {
    let db = await this.getDb();

    return new Promise(resolve => {
      let trans = db.transaction(["baselines"], "readonly");
      trans.oncomplete = () => {
        resolve(baseline);
      };

      let store = trans.objectStore("baselines");
      let baseline = {};

      store.get(key).onsuccess = e => {
        baseline = e.target.result;
      };
    });
  },

  async getResultsOfAction(key) {
    let db = await this.getDb();

    return new Promise(resolve => {
      let trans = db.transaction(["resultsOfActions"], "readonly");
      trans.oncomplete = () => {
        resolve(resultsOfAction);
      };

      let store = trans.objectStore("resultsOfActions");
      let resultsOfAction = {};

      store.get(key).onsuccess = e => {
        resultsOfAction = e.target.result;
      };
    });
  },

  async saveBaseline(baseline) {
    //console.log("saveBaseline");
    let db = await this.getDb();

    return new Promise(resolve => {
      let trans = db.transaction(["baselines"], "readwrite");
      trans.oncomplete = () => {
        resolve();
      };

      let store = trans.objectStore("baselines");
      store.put(baseline, baseline.modelId);
    });
  },

  async saveResultsOfActions(resultsOfActions) {
    let db = await this.getDb();

    return new Promise(resolve => {
      let trans = db.transaction(["resultsOfActions"], "readwrite");
      trans.oncomplete = () => {
        resolve();
      };

      let store = trans.objectStore("resultsOfActions");
      store.put(resultsOfActions);
    });
  },

  async saveDependencyGraphDisplay(saveFile) {
    let db = await this.getDb();

    return new Promise(resolve => {
      let trans = db.transaction(["dependencyGraphDisplay"], "readwrite");
      trans.oncomplete = () => {
        resolve();
      };
      let store = trans.objectStore("dependencyGraphDisplay");
      store.put(saveFile);
    });
  }
};
