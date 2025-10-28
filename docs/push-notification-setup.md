# Push notification credential configuration

This guide summarizes the platform credentials required to deliver Expo push notifications for the mobile app. Complete these steps before publishing builds or enabling high-priority fraud alerts in production.

## Prerequisites

- An Expo project linked to EAS (the Expo Application Services backend).
- Access to the Apple Developer Program (for iOS) and a Google Cloud project (for Android Firebase Cloud Messaging).
- The Expo CLI (`npm install --global eas-cli`) authenticated with the organisation that owns the project.

> All secrets referenced below should be stored securely (e.g. in 1Password or your team vault). Do **not** commit private keys or JSON credential files to the repository.

## iOS – Apple Push Notification service (APNs)

1. **Enable Push Notifications for the App ID**
   - Sign in to <https://developer.apple.com/account/>.
   - Navigate to **Certificates, IDs & Profiles → Identifiers** and select the existing App ID (or create one) that matches the Expo bundle identifier used by the app.
   - Enable the **Push Notifications** capability and save the change.

2. **Create an APNs Auth Key**
   - Still under **Certificates, IDs & Profiles**, open the **Keys** tab and create a new key.
   - Tick **Apple Push Notifications service (APNs)** and download the generated `.p8` file once. Record the **Key ID** and **Team ID** – they are required later.

3. **Upload the key with EAS**
   - Run `eas credentials` and choose **iOS > Push Notifications Key** for the target project.
   - Provide the `.p8` key file, Key ID, and Team ID when prompted. EAS will upload and encrypt the credential for your project.
   - Confirm the key appears in the Expo dashboard under **Credentials** for the iOS platform.

4. **Verify bundle identifiers**
   - Ensure `app.json` (or `app.config.ts`) declares the correct `expo.ios.bundleIdentifier`. This value must match the App ID configured above for the credential to work when building with EAS.

## Android – Firebase Cloud Messaging (FCM)

1. **Create/Select a Firebase project**
   - Visit <https://console.firebase.google.com/> and create a new project (or reuse an existing one dedicated to push messaging).

2. **Register the Android app**
   - Inside the Firebase project, add an Android app using the application ID declared in `app.json` (`expo.android.package`). You do not need to download the `google-services.json` file for Expo Router projects, but saving it in your secret manager is recommended.

3. **Generate a server key**
   - In the Firebase console, open **Project Settings → Cloud Messaging**.
   - Under *Cloud Messaging API (Legacy)* copy the **Server key** and **Sender ID**. (If the legacy API is disabled, enable it – Expo still relies on the legacy key.)

4. **Upload the key with EAS**
   - Run `eas credentials` and choose **Android > FCM**.
   - Paste the server key (and confirm the sender ID when prompted). The credentials will be uploaded and stored with the project.

5. **Double-check notification channel naming**
   - The app uses the default channel name `default`. Ensure no conflicting channel configuration exists in prior builds or overrides.

## Expo project configuration recap

- `app.json` already registers the `expo-notifications` plugin. No additional plugin configuration is required unless you plan to customise sounds or categories.
- Keep the Expo CLI logged in with an account that has permission to read the stored credentials (run `eas whoami` to verify).
- If you rotate APNs or FCM keys, re-run `eas credentials` to upload the new secret and trigger a rebuild.

## Supabase + edge function alignment

- The Supabase `profiles` table now stores the Expo push token in `device_token`. The mobile app automatically upserts this value when the user grants permission.
- The `analyze-upi` Edge Function dispatches critical/high severity alerts to the registered devices via the `send-notification` function. Ensure the function has access to the `EXPO_ACCESS_TOKEN` secret when push security tokens are enforced.

## Testing checklist

1. After uploading credentials, run `npx expo start --dev-client` and install a development build to verify the device token is written to the profile row in Supabase.
2. Trigger the `send-notification` function manually:
   ```bash
   curl \
     -X POST "https://<project>.functions.supabase.co/send-notification" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{
           "deviceToken": "ExponentPushToken[example]",
           "title": "Credential smoke test",
           "body": "If you see this, APNs/FCM is wired up correctly.",
           "priority": "high",
           "badge": 1
         }'
   ```
3. Confirm the device receives the notification in the foreground and the app badge updates on iOS.
4. Repeat on both platforms after credentials rotate or the bundle/package identifiers change.

Following these steps keeps Expo, Supabase, and the notification infrastructure aligned so high-risk fraud alerts reach end-users immediately.
