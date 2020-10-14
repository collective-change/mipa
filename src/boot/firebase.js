// Firebase App (the core Firebase SDK) is always required and must be listed first
import * as firebase from "firebase/app";

// Add the Firebase products that you want to use
import "firebase/auth";
import "firebase/firestore";

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

// set unlimited cache size
/* firebase.firestore().settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
}); */

// enable offline persistence
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

// Export types that exists in Firestore
// This is not always necessary, but it's used in other examples in Vuexfire docs
const { TimeStamp, GeoPoint } = firebase.firestore;
export { TimeStamp, GeoPoint };

export { firebase, firebaseApp, firebaseAuth, firebaseDb };
