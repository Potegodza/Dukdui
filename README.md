# Dukdui
DukDui Project

## Login

The login and registration pages are in `app/login/`. They use Firebase Authentication for email/password and Google sign-in.

Before using them, open the matching Firebase project (`dukdui-b71b0`) in **Firebase Console → Authentication** and click **Get started** if prompted. Then enable **Email/Password** and **Google** under **Sign-in method**. Add the site host (for local development, `localhost`) under **Authentication → Settings → Authorized domains**. Use `http://localhost:8765/...` when developing locally; `127.0.0.1` is a different host and must be added separately if used. Authorized domains contain only the host, without protocol, port, or path. Serve the project over HTTP or HTTPS (not `file://`) so the Firebase modules can load.

If Firebase returns `CONFIGURATION_NOT_FOUND`, Authentication has not been initialized for that project, or the web app's API key and `projectId` belong to different Firebase projects. Initialize Authentication in the console and confirm the web app settings in `app/login/firebase.js` match the same project.

The Firebase web app configuration is in `app/login/firebase.js`. Firebase web API keys identify the project; protect user data with Firebase Security Rules.

The Account page stores the signed-in user's bio, department, year, interests, and profile update time in `users/{uid}` in the `(default)` Cloud Firestore database. If the database has not been created, create it in **Firebase Console → Build → Firestore Database** first. Deploy the rules with Firebase CLI (`firebase deploy --only firestore:rules`) or publish the contents of `firestore.rules` from **Firestore → Rules** in Firebase Console.

## Private chat

The chat page and its assets are grouped in `app/private-chat/`. It requires a signed-in user and uses Cloud Firestore listeners for matched-user lists and live messages. After creating the `(default)` database, deploy `firestore.rules` before testing.

The chat only reads existing `matches/{matchId}` documents where the signed-in UID is in the `participants` array. The document should contain exactly the two matched UIDs and a `participantNames` map keyed by UID, for example:

```text
matches/{matchId}
  participants: ["uidA", "uidB"]
  participantNames: { "uidA": "ชื่อ A", "uidB": "ชื่อ B" }
```

The matching system must create these documents only after both users like each other. Chat clients cannot create or change matches; a trusted matching backend must create them. Messages are stored at `matches/{matchId}/messages/{messageId}` and can only be read by either participant. The chat currently loads the newest 100 messages in an open conversation.

Random matching uses Socket.IO on the same server as the app. It does not create Firestore matches for private chat; the private chat list remains empty until a trusted matching backend creates a `matches/{matchId}` document.

## Local navigation

The shared navigation connects the home, private chat, account, and random discussion pages. The app and Socket.IO matching server share one port. Install the matching server dependencies with `npm ci --prefix app\random-discussions` if they are not installed yet, then run `npm start`. You no longer need to start a second server.

Open `http://localhost:8765/app/login/login.html` and sign in. The app pages and random discussion both use port `8765`. To change the port, set `PORT` before running `npm start`. If using separate hosts for a deployment, set `window.DUKDUI_APP_ORIGIN` and `window.DUKDUI_RANDOM_ORIGIN` before `app/shared/navigation.js` loads. Page files are organized under `app/` by feature, with shared navigation assets in `app/shared/`.

Random chat now requires a Firebase signed-in user. The server verifies the Firebase ID token before accepting a Socket.IO connection. To let the local server read sanctions from Firestore, authenticate Google Cloud CLI application-default credentials for an account with Firestore access:

```powershell
gcloud auth application-default login
gcloud config set project dukdui-b71b0
```

The existing `app/random-discussions/reports.db` file is retained locally. It contained no reports or moderation records when the Firestore migration was prepared, so there was no data to import. New reports, sanctions, and user moderation history are stored in Firestore.

## Deployment

The no-billing deployment target is Render Free for the Node.js app and Socket.IO server. Firebase remains on the Spark plan for Authentication and Firestore. The Render Blueprint is in `render.yaml`; it uses the free Singapore region, installs the dependencies in `app/random-discussions/`, and starts the app with `npm start`.

Render Free is suitable for testing and hobby use, not guaranteed always-on service. It can spin down after 15 minutes without inbound traffic, take about a minute to wake, and has a shared 750 free instance-hours per workspace per month. Its filesystem is ephemeral, so the local `reports.db` is not used for production moderation; reports, sanctions, and moderation history are stored in Firestore. Firestore Spark quotas still apply and can pause Firestore features if exceeded. See [Render Free service limits](https://render.com/docs/free) and the [Blueprint reference](https://render.com/docs/blueprint-spec).

Before creating the Render service:

1. Make sure Firebase Authentication and the default Firestore database are enabled for `dukdui-b71b0`.
2. Create a dedicated Google Cloud service account for this project and grant it the `Cloud Datastore User` (`roles/datastore.user`) role. Create a JSON key and keep the downloaded file outside this repository. Never commit or paste the key into source files.
3. In Render, create a Blueprint from this repository and use `render.yaml`. Set the prompted secret variables:
   - `ADMIN_PASSWORD`: choose a strong, unique admin password.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: paste the full JSON key contents. The server validates that its `project_id` is `dukdui-b71b0`.
   - `SESSION_SECRET` is generated by the Blueprint.
4. After Render gives the service its `onrender.com` URL, add that hostname (without protocol or path) under **Firebase Console → Authentication → Settings → Authorized domains**. The server automatically uses Render's external URL for Socket.IO and its allowed-origin check.
5. Open `https://<your-render-service>.onrender.com/app/login/login.html` to sign in. The admin panel is at `/admin.html`.

For local development, the server continues to use Google Application Default Credentials when `FIREBASE_SERVICE_ACCOUNT_JSON` is not set. Follow the local `gcloud auth application-default login` steps above.
