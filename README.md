# Dukdui
DukDui Project

## Login

The login and registration pages are in `app/login/`. They use Firebase Authentication for email/password and Google sign-in.

Before using them, open the matching Firebase project (`dukdui-b71b0`) in **Firebase Console → Authentication** and click **Get started** if prompted. Then enable **Email/Password** and **Google** under **Sign-in method**. Add the site host (for local development, `localhost`) under **Authentication → Settings → Authorized domains**. Use `http://localhost:8765/...` when developing locally; `127.0.0.1` is a different host and must be added separately if used. Authorized domains contain only the host, without protocol, port, or path. Serve the project over HTTP or HTTPS (not `file://`) so the Firebase modules can load.

If Firebase returns `CONFIGURATION_NOT_FOUND`, Authentication has not been initialized for that project, or the web app's API key and `projectId` belong to different Firebase projects. Initialize Authentication in the console and confirm the web app settings in `app/login/firebase.js` match the same project.

The Firebase web app configuration is in `app/login/firebase.js`. Firebase web API keys identify the project; protect user data with Firebase Security Rules.

The Account page stores the signed-in user's bio, department, year, interests, and profile update time in `users/{uid}` in the `(default)` Cloud Firestore database. The `dukdui-b71b0` project currently does not have this database; create it in **Firebase Console → Build → Firestore Database** first. These profile documents are private: `firestore.rules` lets a signed-in user read/write only their own profile. Then deploy the rules with Firebase CLI (`firebase deploy --only firestore:rules`) or publish the contents of `firestore.rules` from **Firestore → Rules** in Firebase Console.
