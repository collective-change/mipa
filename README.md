# MIPA (mipa)

Mipa is the strategic coordination software created for the mission of https://collective-change.org. Find out more about mipa by visiting the site.

This program is released under GNU Affero General Public License v3.0

## Running an instance of mipa

After obtaining a copy of mipa, do the following to run your instance.

These instructions are current as of 2020.10.14. If you notice that something in the process has changed, please help update this documentation.

### Create a project on Google Firebase
1. Go to https://console.firebase.google.com/ (you may need to create an account first)
2. Click **Add project**. Name the new project something like "mipa-dev-yourName". Enabling Google Analytics is optional.
3. Once the Firebase project is created, add a web app by clicking on the **</>** icon. Give the app a nickname, like "my mipa web app". Check the box to set up Firebase Hosting. Then click **Register app**.
4. Ignore "Add Firebase SDK" instructions. Mipa's code already has this set up. So just click **Next**.
5. Install firebase-tools per on-screen instructions. Then click **Next**.
6. Per on-screen instructions, sign in to Google; but don't initiate your project with firebase init or deploy it yet. Just click **continue to console**.
7. On the firebase console, click the **Authentication** block, then **Set up sign-in method**. Enable **Email/Password**, then **Save**.
8. Go back to the Project Overview page by clicking on the home icon, then on the **Cloud Firestore** block, then **Create database**. Select **Start in production mode**, then **Next**, then pick a database location, then **enable**.

### Add your project's credentials
1. Make a copy of the **.quasar.env_sample.json** file and name it **.quasar.env.json**.
2. On a browser tab, go to https://console.cloud.google.com/ choose the project you just created, then APIs & Services > Credentials. We'll need the API key (browser key) from here for step 4.
3. On another browser tab, go to https://console.firebase.google.com/, go to **Settings** > **General**.
4. In the newly created **.quasar.env.json** file, add in your Firebase project's credentials from the above steps. **.quasar.env.json** is already in .gitignore so the file will not be synced back to the repository.

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
If all went well your browser should auto-load mipa's login page. Create an account for yourself then add a new organization on the homepage to test things out.

### Build the app for production and deploy to Firebase

```bash
yarn build
firebase deploy
```

That's it! We look forward to your joining our mission to save the world!
