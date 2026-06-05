# Open source licences

The mobile app includes open-source software. Full licence text is shown in **Settings → Open source licences** (`app/lib/openSourceLicenses.ts`).

## Photo crop (Option B)

Still images use **[expo-dynamic-image-crop](https://github.com/nwabueze1/expo-dynamic-image-crop)** (MIT) from the photo editor **Crop** tool (not immediately after pick). Videos and GIFs skip crop.

## Add Friend pairing token

New offers use a **server-minted opaque token** (32 hex characters) in QR (`AFQR2|…`) and NFC (`PN2|…`). Deploy updated Cloud Functions after pulling client changes.

After adding or upgrading dependencies, run:

```powershell
cd "C:\Users\dunca\OneDrive\Desktop\App FInal V3"
npm install
npx expo install expo-dynamic-image-crop react-native-gesture-handler
npm run android
```

If npm fails with certificate errors on Windows:

```powershell
npm config set strict-ssl false
npm install
npm config set strict-ssl true
```

Or use Node’s system CA store:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
npm install
```

`react-native-gesture-handler` must be imported first in `index.tsx` (already configured).
