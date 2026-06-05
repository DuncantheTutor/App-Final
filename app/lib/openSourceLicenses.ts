/** SPDX identifiers and licence text for Settings → Open source licences. */

export type OpenSourceLicenseEntry = {
  name: string;
  spdx: string;
  copyright: string;
  body: string;
};

const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const APACHE2_BODY = `Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.`;

function mit(name: string, copyright: string): OpenSourceLicenseEntry {
  return { name, spdx: "MIT", copyright, body: MIT_BODY };
}

function apache2(name: string, copyright: string): OpenSourceLicenseEntry {
  return { name, spdx: "Apache-2.0", copyright, body: APACHE2_BODY };
}

/** Direct and key transitive open-source components shipped in the mobile app. */
export const OPEN_SOURCE_LICENSES: OpenSourceLicenseEntry[] = [
  mit("React", "Copyright (c) Meta Platforms, Inc. and affiliates."),
  mit("React Native", "Copyright (c) Meta Platforms, Inc. and affiliates."),
  mit("Expo SDK", "Copyright (c) 650 Industries, Inc. (Expo)"),
  mit("expo-image-picker", "Copyright (c) 650 Industries, Inc. (Expo)"),
  mit("expo-image-manipulator", "Copyright (c) 650 Industries, Inc. (Expo)"),
  mit("expo-dynamic-image-crop", "Copyright (c) Fidelis Okeke and contributors."),
  mit("expo-camera", "Copyright (c) 650 Industries, Inc. (Expo)"),
  mit("react-native-gesture-handler", "Copyright (c) Software Mansion"),
  mit("react-native-safe-area-context", "Copyright (c) Th3rd Wave"),
  mit("react-native-svg", "Copyright (c) Software Mansion"),
  mit("@react-native-async-storage/async-storage", "Copyright (c) Facebook, Inc."),
  mit("react-native-view-shot", "Copyright (c) gre/react-native-view-shot contributors"),
  mit("lottie-react-native", "Copyright (c) Airbnb, Inc."),
  mit("react-native-qrcode-svg", "Copyright (c) Paul Shen"),
  mit("react-native-ble-plx", "Copyright (c) Polidea"),
  mit("react-native-nfc-manager", "Copyright (c) replique"),
  apache2("Firebase JavaScript SDK", "Copyright 2017 Google LLC"),
  {
    name: "TweetNaCl / tweetnacl-util",
    spdx: "Unlicense / Public Domain",
    copyright: "TweetNaCl authors",
    body: "TweetNaCl is released into the public domain. See the Unlicense or CC0 where applicable.",
  },
];
