// Firebase App (the core Firebase SDK) is always required and must be listed first
import firebase from "firebase/app";

// Add the Firebase products that you want to use
require("firebase/auth").default;
require("firebase/firestore").default;

import { showErrorMessage } from "src/utils/util-show-error-message";

// Your web app's Firebase configuration
var firebaseConfig = {
  apiKey: process.env.apiKey,
  authDomain: process.env.authDomain,
  databaseURL: process.env.databaseURL,
  projectId: process.env.projectId,
  storageBucket: process.env.storageBucket,
  messagingSenderId: process.env.messagingSenderId,
  appId: process.env.appId
};
// Initialize Firebase
let firebaseApp = firebase.initializeApp(firebaseConfig);
let firebaseAuth = firebaseApp.auth();
let firebaseDb = firebaseApp.firestore();

// Use Firebase emulator for development and testing
if (process.env.DEV || process.env.ENV_TYPE == "Running Test") {
  console.log("process.env.DEV", process.env.DEV);
  console.log("process.env.ENV_TYPE", process.env.ENV_TYPE);
  firebaseApp.auth().useEmulator("http://localhost:9099/");
  firebaseDb.useEmulator("localhost", 5002);
  //TODO: if process.env.DEV, use admin sdk to create dev user
  // on firebase auth that corresponds to the user in
  // initial-firestore-emulator-data, so developer can log in
  // to development instance of mipa
}

// set unlimited cache size
/* firebase.firestore().settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
}); */

// enable offline persistence if in production or dev environments (not testing)
if (process.env.PROD || process.env.DEV) {
  firebase
    .firestore()
    .enablePersistence({ synchronizeTabs: true })
    .catch(function(err) {
      if (err.code == "failed-precondition") {
        showErrorMessage(
          "Error enabling persistence (failed precondition)",
          error.message
        );
      } else if (err.code == "unimplemented") {
        showErrorMessage(
          "Error enabling persistence (unimplemented)",
          error.message
        );
      }
    });
}

// Export types that exists in Firestore
// This is not always necessary, but it's used in other examples in Vuexfire docs
const { TimeStamp, GeoPoint } = firebase.firestore;
export { TimeStamp, GeoPoint };

export { firebase, firebaseApp, firebaseAuth, firebaseDb };
