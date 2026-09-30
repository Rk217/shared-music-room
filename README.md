# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Supabase Audio Uploads

Audio files are stored in Supabase Storage. Song titles and public audio URLs continue to be stored in the Firebase Firestore `songs` collection.

1. Create a Supabase project and a **public** Storage bucket named `songs`. Set a file size limit and allow the audio formats you want to accept.
2. In the Supabase SQL Editor, allow anonymous clients to upload only to that bucket:

   ```sql
   create policy "Allow uploads to songs bucket"
   on storage.objects
   for insert
   to anon
   with check (bucket_id = 'songs');
   ```

3. Copy `.env.example` to `.env.local`. Fill in the project URL and **publishable** key from the Supabase project API settings. Do not use a `secret` or `service_role` key in the app.
4. Restart Expo with `npx expo start -c` so it loads the environment values.

The public bucket makes uploaded audio URLs playable without signing in. The anonymous upload policy also means anyone with the app can upload files, so configure a strict bucket size limit and review Supabase usage. Free plans have quotas and are not unlimited; add authentication or a server-side upload flow before opening uploads to a wider audience.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
