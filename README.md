# MIPA (mipa)

Mipa is the strategic coordination software created for the mission of https://collective-change.org. Find out more about mipa by visiting the site.

This program is released under GNU Affero General Public License v3.0

## Running an instance of mipa

After obtaining a copy of mipa (best done by forking and cloning the repository if you wish to contribute), do the following to run your instance.

These instructions are current as of 2020.10.14. If you notice that something in the process has changed, please help update this documentation.

### Create a project on Google Firebase
1. Go to https://console.firebase.google.com/ (you may need to create an account first)
2. Click **Add project**. Name the new project something like "mipa-your-name". Enabling Google Analytics is optional.
3. Once the Firebase project is created, click on the **</>** icon to add a web app. Give the app a nickname, like "my mipa web app". Check the box to set up Firebase Hosting. Then click **Register app**.
4. Ignore "Add Firebase SDK" instructions. Mipa's code already has this set up. So just click **Next**.
5. Install firebase-tools per on-screen instructions.
6. Per on-screen instructions, sign in to Google; but don't initiate your project with firebase init or deploy it yet. Just click **continue to console**.
7. On the firebase console, click **Authentication**. Then **Set up sign-in method**; enable **Email/Password**.
8. On the firebase console, click **Cloud Firestore**. Then **Create database**; select **Start in production mode**; pick a database location that makes sense for you, then **enable**.
9. From the bottom of the left navigation panel, change the **Spark** plan to **Blaze** plan. (This shouldn't be needed.)

### Add your project's credentials
1. Make a copy of the **.quasar.env_sample.json** file and name it **.quasar.env.json**.
2. Back on the Firebase Console, go to **Settings** > **General**.
3. In the newly created **.quasar.env.json** file, add in your Firebase project's credentials from the above steps into the `development`, `production` and `test` sections (or different sets of credentials as you require). **.quasar.env.json** is already in .gitignore so the file will not be synced back to the repository.

### Modify .firebaserc
1. Make a copy of the **.firebaserc_sample** file and name it **.firebaserc**.
2. In the file, in the "default" property, use your project id.

### Install dependencies for Cloud Functions
Go to `functions` directory
```bash
cd functions
npm install
```

### Install dependencies for other parts of the project
For the rest of the project we use yarn instead of npm because of the more deterministic way it chooses dependencies. This helps us developers keep our dependencies identical.

If you don't have yarn installed yet, follow these instructions to install it: https://classic.yarnpkg.com/en/docs/install/

Go back to your project's root directory and install dependencies using yarn.
```bash
cd your-project-directory
yarn install
```

### Build the app and deploy to Firebase

This will deploy to the `production` environment you configured in your **.quasar.env.json** file. This loads **firestore.rules** into Firestore, which we need even for development (assuming you configured `development` and `production` with the same credentials in .quasar.env.json).

```bash
yarn build
firebase deploy
```

If all went well, mipa will be running at https://your-project-id.web.app. Register an account for yourself, and have at it!

### Start the app in development mode (hot-code reloading, error reporting, etc.)

For development, it's easier to serve from localhost rather than deploying to firebase.  Do this:

```bash
yarn dev
```

Your browser should open a new page pointing to https://localhost:8080/. But since the SSL certificate on dev is auto-generated, you should see a privacy warning in your browser. If you're using Chrome, just click on **Advanced** then **Proceed to localhost (unsafe)**. Other browsers do something similar, too.

That's it! When you modify source code, the localhost website will automatically update with the changes you make.

We look forward to your joining our mission to save the world!
