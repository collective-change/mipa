# MIPA (mipa)

Mipa is the strategic coordination software created for the mission of collective-change.org.

This program is released under GNU Affero General Public License v3.0

## Running an instance of mipa

After obtaining a copy of mipa, do the following to run your instance.

These instructions are current as of 2020.10.14. If you notice that something in the process has changed, please help update this documentation.

### Prepare a project on Google Firebase
1. Go to https://console.firebase.google.com/ (you may need to create an account first)
2. Click **Add project**. Name the new project anything you like, perhaps "my-mipa". Enable Google Analytics if you wish.
3. Once the Firebase project is created, click on the **</>** icon to add a web app. Give the app a nickname, like "my mipa web app". Check the box to set up Firebase Hosting. Then click **Register app**.
4. Ignore "Add Firebase SDK" instructions. Mipa's code already has this set up. So just click **Next**.
5. Install firebase-tools per on-screen instructions.
6. Per on-screen instructions, sign in to Google; but don't initiate your project with firebase init or deploy it yet. Just click **continue to console**.
7. Back on the firebase console for your mipa project, click **Cloud Firestore**. Then **Create database**; select **Start in production mode**; pick a database location that makes sense for you, then **enable**.

### Add your project's credentials
1. Make a copy of the **.quasar.env_sample.json** file and name it **.quasar.env.json**.
2. On https://console.firebase.google.com/, go to **Settings** > **General**.
3. In the newly created **.quasar.env.json** file, add in your Firebase project's credentials from the above step. **.quasar.env.json** is already in .gitignore so the file will not be synced back to the repository.

### Install dependencies
If you don't have **yarn** installed yet, follow these instructions to install it: https://classic.yarnpkg.com/en/docs/install/

Then run yarn in mipa's root directory to install mipa's dependencies.
```bash
yarn
```

### Start the app in development mode (hot-code reloading, error reporting, etc.)

```bash
yarn dev
```

### Build the app for production and deploy to Firebase

```bash
yarn build
firebase deploy
```

### Customize the configuration

See [Configuring quasar.conf.js](https://quasar.dev/quasar-cli/quasar-conf-js).
